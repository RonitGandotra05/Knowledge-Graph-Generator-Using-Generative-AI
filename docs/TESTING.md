# Verification notes

Run `npm test`, `npm run test:e2e`, `npm run build` and `npm run format:check` from the Desktop repository. Playwright uses Chromium and a local Vite server. Network access is needed for dependency/browser installation, public test-PDF downloads and English OCR language data on first use. Automated model requests are intercepted with dummy keys; they do not spend API credits.

## Verified coverage

The 2026-10-03 checks include **100 unit tests and 39 browser scenarios**, with the online corpus and uploaded scanned paper enabled. Strict TypeScript, production compilation and source formatting passed. The final redesign rerun includes discipline-neutral fixtures, full desktop fit checks and active navigation recovery. Production browser checks cover the ten-PDF live graph, usage receipt, offline export, both-theme desktop fit, active homepage navigation and reduced-motion/mobile behavior. See [the multi-paper implementation and verification report](MULTI-PAPER-WORKFLOW.md) for new collection, accounting and live-progress behavior.

| Area                | Checks                                                                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parsing/OCR         | Ten actual PDFs together (287 pages); nine online papers separately; mixed native/scanned and rotated pages; combined 273-page corpus; PDF, DOCX and text; corrupt files, automatic OCR failure, partial-page retention and file/page bounds.                         |
| Coverage/provenance | Every parsed body passage traversed in bounded batches; literal/alias matching; per-file passage IDs; original PDF page and paragraph identity; independent evidence for corroborating relationships; up to five node references per paper.                           |
| API/usage           | Direct request adapters, strict structured output, malformed JSON, truncation, authentication/quota failures, cancellation, total-only quota reconciliation, cache/reasoning usage, known/unknown pricing, explicit free-plan assumptions and missing-usage handling. |
| Pacing/estimates    | Serial requests, full input/completion reservations, rolling minute/day limits, Retry-After/reset headers, invalid-key blocking, remaining-call subtraction, observed latency refinement and multi-window daily estimates.                                            |
| Live/recovery       | Intermediate grounded nodes and validated relationships; actual progress counters; pause/resume; no repeated completed discovery section; New graph and refresh preserve ongoing drafts and usage; incomplete history labels remain Ongoing.                          |
| Graph/editing       | Both node shapes, five layouts, label spacing, category/confidence filters, physics collision separation, pinned dragging, settling/pause, dense 60-node regression, proof inspection, editing, undo/redo, themes and mobile layout.                                  |
| Export/security     | Safe JSON imports, unrelated-field stripping, source/usage whitelists, third-party notice retention, inert malicious labels, offline editable HTML with zero HTTP requests, PNG/SVG, preserved per-paper proof and corroborating edges.                               |
| Storage/UI          | Homepage retained; unified one-page workspace; hamburger history/theme controls; six-item history pagination; old-history migration; all provider keys memory-only and cleared on refresh; no secrets/original PDFs in drafts/exports.                                |

## Presentation and discipline-neutral checks

The complete setup—upload, optional focus/keywords, provider, model, API key and Build—fits within 1440×900, 1366×768 and 1280×720 viewports in dark and light themes, both empty and after upload with Groq selected. Assertions compare document scroll height with viewport height and confirm each required field is in view. No required form is clipped or hidden to obtain this result. Live and completed two-node results also fit 1366×768 with both nodes visible; the graph receives the remaining viewport space. Mobile at 390 pixels keeps natural vertical flow with no horizontal overflow. Reduced-motion preferences disable scene animation and pointer depth.

A controlled in-flight analysis stays active while the homepage is visible, reopens through its Ongoing history entry without resending requests, finishes on the homepage, and displays the same graph and usage receipt when reopened. Separate fixtures verify astrophysics, materials research and social-science concept/relationship validation with exact source mapping. These fixtures do not constitute fresh live model evaluations.

## Real papers and AI test doubles

The uploaded `05v1.pdf` has 14 scanned pages with no native text layer. Its browser test now performs English OCR automatically, verifies recovered text, relevant concept matches and page references, then exercises the graph workflow with controlled provider responses. The ten-file test combines it with all nine online papers and checks every filename/page identity. It does not ask for OCR permission.

```sh
npm run papers:fetch
ATLAS_TEST_PORT=5300 ONLINE_PAPERS=1 PAPER_PATH=/absolute/path/05v1.pdf npm run test:e2e
node scripts/report-paper-tests.mjs
```

Without `ONLINE_PAPERS=1` and `PAPER_PATH`, the optional real-corpus/scanned-paper scenarios are skipped. First-time OCR fetches language data; test artifacts and original/private papers remain outside source control. Public sources, download hashes, parse measurements and reproduction commands are documented in [ONLINE-PAPER-TESTING.md](ONLINE-PAPER-TESTING.md).

The generated ten-paper fixture uses actual PDF parsing and intercepted AI responses. Its 20 calls, 5,600 reported tokens and $0.00416 accounting result are deterministic **mock values**, not live API usage. It checks graph growth before completion, all ten papers’ evidence, saved usage, offline HTML, JSON reimport and narrow-screen visibility.

Earlier live Groq testing used the user-authorized key and actual model output; measured semantic coverage, original HTML comparison and downloads are documented separately in [LIVE_GROQ_ANALYSIS.md](LIVE_GROQ_ANALYSIS.md). No real key is needed or retained for the current automated suite. Current Cerebras tests use the generic compatible endpoint, without a dedicated picker or free-access claim.

## Limits of verification

Exact quotes establish provenance in parsed/OCR text; they cannot prove scientific truth or correct transcription. Automated response fixtures test implementation behavior rather than live semantic quality. Provider CORS, account/model availability, billing eligibility and account-wide quota compliance depend on the deployment and actual account. Price/duration displays are dated estimates; missing usage/pricing remains unknown, and provider invoices are authoritative.

Node/edge edits retain the original evidence and are marked as user edits. Extracted line/paragraph references describe local segmentation, not printed-paper line numbering. Excluded pages/files are explicitly listed and contribute no evidence. Original tracked examples remain unchanged under `legacy/`.
