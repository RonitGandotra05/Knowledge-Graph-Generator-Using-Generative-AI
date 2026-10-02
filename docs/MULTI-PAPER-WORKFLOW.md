# Multi-paper workflow, estimates and live analysis

Implemented and checked on 2026-10-03 in the Desktop repository.

The separate workspace view shows all required setup inputs together on one page and accepts **up to ten PDFs together**, automatically recognizes scanned pages, explains excluded files/pages, estimates the run before sending document excerpts, and displays the graph as grounded results arrive. API credentials remain in this tab’s memory. Evidence Atlas charges **$0**; API billing belongs to the chosen provider.

## Uploading and recovering text

Files are processed sequentially, with a filename and page counter during parsing/OCR. Each PDF retains its own page indices and paragraph IDs. Passage IDs are namespaced by file, so page 1 of one paper cannot be mistaken for page 1 of another. Existing DOCX/text upload support remains available; those formats provide paragraph references rather than PDF pages.

PDF.js reads native text first. Sparse pages fall back to local English Tesseract OCR automatically; there is no OCR permission checkbox. Existing readable text layers are retained. OCR initialization and recognition have timeouts. Successfully recognized pages survive a later failure. A broken OCR worker is terminated rather than receiving overlapping recognition requests.

Every file has an Included, Partial or Excluded result. Partial papers list the unreadable page indices. Excluded papers contribute no text to discovery or extraction. Other readable files continue. More than ten files are rejected before changing the current project. The bounds are 30 MB and 500 PDF pages per file; OCR supports that same page bound without the previous 100-page cutoff.

OCR language data downloads from the language-data host; page images stay local. English OCR can still misread columns, symbols and identifiers. Exact quote validation verifies the extracted text, not its transcription or scientific truth.

## Before sending API requests

The unified workspace estimates discovery/relationship request counts, input/output tokens, provider cost and remaining duration. Completed sections are subtracted when resuming. After discovery, the relationship count is refined to sections containing at least two selected concepts. Token estimates use serialized excerpt size and prompt/schema allowances; completion limits form a conservative upper estimate rather than claiming precise tokenization.

Known models use a dated published-price snapshot, including applicable cache pricing. Private endpoints, lookalike hosts and unknown models display an unknown price. ChatGPT subscriptions do not replace OpenAI API billing. The prices cover standard synchronous text requests; taxes, credits and account-specific billing can differ. Groq/Gemini users can explicitly select an eligible free API plan; $0 then assumes they remain within its quota. An API key alone does not reveal billing eligibility.

Pricing references checked on 2026-10-03: [OpenAI](https://developers.openai.com/api/docs/pricing), [Groq models](https://console.groq.com/docs/models), [Claude](https://platform.claude.com/docs/en/about-claude/pricing), [Gemini](https://ai.google.dev/gemini-api/docs/pricing).

Duration combines serial request latency, minimum spacing, requests/minute and estimated tokens/minute. It starts with a provider-specific latency assumption and refines from observed request durations. Parsing/OCR has already finished when the Build estimate appears. Existing quota use and readable provider reset headers can extend waits. This is a range, not a promised completion time.

## Groq pacing and large collections

The application’s conservative Groq policy allows one request in flight, at least 2.5 seconds between calls, up to 20 calls/minute and 6,000 estimated tokens/minute. Full request input plus maximum completion tokens is reserved before sending; returned usage reconciles that reservation. Rolling app ceilings are 80 requests and 100,000 tokens/day. Unknown models receive smaller input/output budgets.

Large collections can exceed a daily window: the estimate explicitly reports this and includes projected reset delays in both typical and upper durations. It does not label a run requiring several quota windows as a guaranteed 20-minute job. Saved progress can continue after a reset. Rate-limit responses and Retry-After extend cooldowns; authentication failures block the rejected key. There are no automatic generation retries. Other applications/tabs and organization usage remain outside this in-memory guard’s view. [Groq’s rate-limit documentation](https://console.groq.com/docs/rate-limits) and the account console remain authoritative.

Cerebras has no dedicated/free-tier promotion. A user-provided compatible endpoint still works with conservative known-host pacing; an unverified model price remains unknown.

## Live graph and source coverage

The progress panel shows completed/planned sections, a real progress bar, elapsed/estimated remaining time, pacing waits, actual API calls, reported input/output tokens and estimated charge. Recent activity records discovery and validation checkpoints. Grounded nodes appear after discovery responses; verified relationships appear after extraction responses. This is incremental validated output, rather than a simulated token stream.

The focus guides discovery but never becomes evidence. Bounded batches traverse parsed body passages without mixing papers in one batch. Stable node IDs and a compact relationship-only schema avoid asking the LLM to regenerate nodes or write HTML. Quotes are validated against the cited paragraph. Layout, physics, editing, HTML and image exports remain local.

Each node retains up to five matched source paragraphs **per paper**, so corroboration from later papers is not lost to a global five-reference cap. Separately cited relationship triples from different papers survive deduplication. File name, PDF page index, paragraph and actual quote remain inspectable and survive JSON/offline HTML exports. The pipeline does not invent causal connections between unrelated papers.

Graph capacities scale with included paper count, from 150 nodes/500 relationships for one paper to 1,500/5,000 for ten, without increasing a single request’s context limit. Omitted-concept warnings remain visible. Whole-paper traversal cannot guarantee that a model identifies every important concept or correctly interprets every supported quote.

Graph editing is suspended during generation; evidence inspection remains available. New nodes preserve existing positions where possible and receive collision separation. The responsive progress panel uses a restrained glow, live status and reduced-motion support. Small two-node graphs adapt to narrow screens while keeping visible labels.

## Pause, recovery and usage receipts

Pause saves discovered concepts, completed discovery/extraction batch IDs, parsed source text, graph state and usage totals. New graph first saves the previous project. History labels incomplete work Ongoing. Refresh restores progress, then requires the API key again. Neither keys nor original PDF files are saved.

Completed discovery sections are not resent on resume with the same paper collection, focus, model and settings. Input changes invalidate the associated checkpoint. Aborting an in-flight request can still incur provider usage; missing usage is explicitly unknown.

At completion the receipt reports API calls and provider-reported input/output/total tokens, including supported cache/reasoning accounting, plus the estimated USD charge. Provider usage is recorded even when model JSON fails validation. A request without a usable usage breakdown is not assigned invented token counts or costs. The provider invoice is the final billing record.

## Verification

- 100 unit tests exercise collection identity, checkpoint reuse, provenance, usage parsing, pricing, cache/thinking tokens, missing reports, pacing-aware estimates, safety, exports and existing graph behavior.
- 39 browser scenarios cover the complete workflow, provider errors, memory-only keys, resumed drafts, editing, physics, offline exports, mobile layout, the online corpus and automatic OCR.
- Ten **actual research PDFs**—nine online papers plus the uploaded `05v1.pdf`—parsed together: **287 PDF pages**, with automatic OCR on all 14 scanned pages of the uploaded paper. All ten filenames and original page indices were retained.
- Ten generated PDFs with deterministic intercepted AI responses produced an intermediate live graph, then ten separately sourced relationships. Each of the two test nodes retained evidence from all ten papers. The fixture reported 20 calls and 5,600 tokens; the accounting result was $0.00416 at the selected OpenAI model’s standard rates. **These are mocked usage values, not live API spending or a scientific evaluation.**
- Failure tests covered corrupt PDFs, failed OCR initialization, a partially readable two-page PDF, and an eleven-file upload that preserves previous work.
- A paused discovery run resumed after New graph and refresh without resending its completed first paper or saving credentials.
- Exported HTML reopened from disk, retained study-10 evidence and made zero HTTP requests. JSON reimport retained all ten corroborating relationships.
- All four collection scenarios were rerun after the final daily-duration correction; the 100-unit-test suite passed again. A separate Chromium smoke test against the built production app passed the ten-PDF live graph, usage receipt, mobile label visibility and offline export workflow. Strict TypeScript, the production build and source formatting checks passed.

New tests use dummy keys and intercepted model responses. They made no live LLM calls. Earlier authorized real Groq testing is recorded separately in [LIVE_GROQ_ANALYSIS.md](LIVE_GROQ_ANALYSIS.md); its measured results have not been replaced by mocked results.

Reproduce the full checks:

```sh
npm test
ATLAS_TEST_PORT=5300 ONLINE_PAPERS=1 PAPER_PATH=/absolute/path/05v1.pdf npm run test:e2e
npm run build
npm run format:check
```

First fetch the public test corpus with `npm run papers:fetch` if it is not present. Papers, exports and private screenshots remain in ignored `.artifacts/`. See [online corpus sources and measurements](ONLINE-PAPER-TESTING.md) and [general verification notes](TESTING.md).
