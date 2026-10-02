# Live Groq evaluation and graph improvements

**Final result: 104 source-grounded nodes and 55 reviewed relationships.** All nine headline features are connected to the abstract's results paragraph. An explicit benchmark of those features, eight additional mechanistic entities and two dataset identifiers passed **19/19**. Every node has source references; every relationship quote matches its cited page and paragraph. This is a human-reviewed result, not a claim that the automatic model output was fully accurate.

[Interactive dark HTML](../output/evaluation/05v1-graph-dark.html) · [Light HTML](../output/evaluation/05v1-graph-light.html) · [Dark PNG](../output/evaluation/05v1-graph-dark.png) · [Light PNG](../output/evaluation/05v1-graph-light.png) · [Scalable SVG](../output/evaluation/05v1-graph-dark.svg) · [Editable graph JSON](../output/evaluation/05v1-graph.json) · [Rendering/source audit](../output/evaluation/05v1-audit.json) · [Entity benchmark](../output/evaluation/05v1-benchmark.json)

The final HTML works offline, preserves evidence and edits, and offers circular/card nodes, layout controls, dark/light themes and image exports. The homepage remains intact. The evaluation originally used a paginated workspace; the subsequent [workspace redesign](WORKSPACE-REDESIGN.md) now shows upload, focus and provider setup together on one page. The live measurements below are unchanged. New projects preserve ongoing drafts in menu history. Credentials remain memory-only.

Evaluation date: 2026-10-03 (Asia/Kolkata). Canonical repository: `/Users/ronitgandotra/Desktop/Knowledge-Graph-Generator-Using-Generative-AI`.

## Scope and credentials

The uploaded 14-page `05v1.pdf` was uploaded through the production website in Chromium with local OCR enabled. Real browser requests went directly to Groq using `openai/gpt-oss-20b` and the user-authorized key. These calls were not intercepted or mocked. The key was supplied through non-echoed stdin, held in process/browser memory, and excluded from source, environment variables, command arguments, storage, exports and diagnostics. Generated artifacts are local and ignored by Git. The live driver was closed and its key cleared after testing; preview/test servers were stopped before delivery.

The nine-paper automated corpus uses deterministic API responses and tests compatibility/provenance/UI, not scientific accuracy. The live experiment and those test doubles are reported separately.

## Original graphs are preserved

All 31 originally tracked files are preserved under `legacy/`, byte-for-byte against Git HEAD `8a833c059bed9ee2fd9f13ce7971ed1427fc5de3`. Their old paths appear deleted because of relocation. SHA-256 verification is saved in `output/evaluation/legacy-preservation.json`. No original graph or source paper was discarded.

| Original HTML graph | Nodes | Relationships | Nodes literally mentioned in available research texts |
| ------------------- | ----: | ------------: | ----------------------------------------------------: |
| Azoospermia         |    44 |            62 |                                                    16 |
| Oligospermia        |    49 |            51 |                                                    24 |
| Asthenozoospermia   |    28 |            34 |                                                    23 |
| Hypospermia         |    44 |            53 |                                                    28 |
| Teratospermia       |    32 |            49 |                                                    25 |

All five original HTMLs rendered without JavaScript errors. Screenshots are in `output/evaluation/legacy-*.png`. Literal matching is a diagnostic, not an accuracy score: abbreviations, paraphrases, composite labels and missing original papers can explain absent matches. Some separate legacy JSON files contain source descriptions or line references; none of the 249 visual HTML relationships has a directly attached exact quote/page/paragraph field.

The old Azoospermia layout uses vis-network/Barnes–Hut, dot nodes, repulsion, central gravity 0.3, spring length 150, spring constant 0.04, damping 0.09 and overlap avoidance 0.1. It gives a useful organic shape, but hub labels/relationship text still overlap and whole-graph labels are tiny. Old HTML depends on a remote CDN. The new viewer retains the circular/force-directed style while measuring label dimensions, separating node bounds, adding stronger repulsion/longer springs, pinning dragged nodes, and stopping damped motion when settled. Cards remain an option. Individual colors distinguish nodes; both themes are supported.

## Failures found and fixes

1. **Generic focus words consumed the graph.** A two-call baseline spent 4,600 actual Groq tokens and produced 10 nodes/2 relationships, with none of the nine headline features. User descriptions now guide discovery; only explicit, source-grounded keywords become initial nodes. Generic words such as “findings” and “significant” are excluded.
2. **Sampling missed named results.** The pipeline now traverses every body passage in bounded discovery requests, rather than using a representative sample. Recognized bibliography sections are excluded. Relationship extraction visits every batch with at least two reviewed concepts.
3. **A small global cap dropped valid discoveries.** An intermediate full scan discovered 108 concepts but retained only 60. Defaults now allow 150 nodes/500 relationships independently of the per-request token budget. Any global overflow is listed explicitly. Isolated grounded nodes remain visible with source references.
4. **Two-column OCR corrupted evidence.** Single-block recognition interleaved unrelated columns. Automatic segmentation alone improved the abstract but still mixed body paragraphs. Local OCR now detects a sustained central gutter, recognizes column crops in reading order, retains full-width material, and snaps crop boundaries to blank rows to avoid cutting letters. It preserves uppercase scientific hyphens across wrapped lines. This is a heuristic; unusual layouts/tables and character errors still require review.
5. **Exact quotes did not guarantee correct relationships.** The baseline miscast a biological system as a distance metric; mixed-column text supported other misleading edges. Generated relationships now need an exact contiguous quote and both endpoints in the same cited paragraph. Clear metric/category mismatches and unconditional causal readings of hedged evidence are rejected. Model-supplied “edited” flags cannot bypass generation checks. Prompts distinguish this study, previous reports, hypotheses and bibliography titles.
6. **Identifiers became duplicate nodes.** Type-aware canonicalization merges conservative technical suffix variations, known typed concepts are included in subsequent discovery prompts to reduce repetition, generic aliases are filtered, and matching accepts inserted uppercase acronyms such as “ATP-binding cassette (ABC) transporter” while retaining original source offsets. Grounded aliases are merged, and a shared single KEGG identifier merges repeated labels without merging distinct genes. Prompts prohibit comparator groups such as “control” as condition aliases. HTML/layout/export generation never uses an LLM.
7. **Large graphs shrank labels.** The initial viewport now keeps labels at least 12 CSS pixels. Overview shows everything; readable view permits panning through all nodes. The full-resolution PNG/SVG exports contain the entire graph, including nodes outside the initial viewport. Both node shapes are checked for bounding-box intersections in all five layouts.
8. **Interrupted requests wasted completed work.** Discovery and completed relationship batches are saved to ongoing drafts without credentials. Relationship extraction resumes finished batches locally and sends only remaining sections. There are no automatic network retries after authentication, provider, JSON or quota errors.
9. **Cerebras promotion was misleading.** Its dedicated picker/free-access hint was removed. A user can still enter a trusted Cerebras URL/model via OpenAI-compatible; existing drafts migrate to that option with credentials cleared. Only Groq has a subtle free-tier hint.

## Scientific assessment

The original graphs concern male infertility; `05v1.pdf` concerns ASD/gut-microbiome analysis. Their node counts cannot establish comparative scientific accuracy. The old graphs are useful visual references, not a gold standard for this unrelated paper.

I visually checked PDF pages 1, 10 and 11 (printed journal pages 190, 199 and 200). The abstract explicitly names nine significant features: Sutterella, Prevotella, Blautia, substance-dependence pathway, circulatory-system pathway, parasitic infectious disease, K02014/TC.FEV.OM, K03585/acrA and K06147/ABCB-BAC. This is the concrete recall benchmark. Features are reported findings, not validated clinical diagnostic tests or proven causes of ASD. The discussion distinguishes the study's increased Prevotella/Blautia abundance from conflicting previous findings and proposes mechanisms with uncertainty; the graph must preserve those distinctions.

A broader intermediate live run made 42 successful calls, spent 70,781 tokens, and retained all nine feature nodes, but only 37 relationships/60 nodes survived. Several headline relationships were lost because model quotations crossed OCR paragraph boundaries or corrected characters instead of quoting them. Other exact quotes still reflected unrelated interleaved columns. That intermediate graph is retained as diagnostic evidence, not designated the final verified output.

### Completed final experiment and explicit source review

| Stage                                               | Live calls | Actual tokens | Nodes | Relationships |
| --------------------------------------------------- | ---------: | ------------: | ----: | ------------: |
| Corrected full-paper automatic extraction           |         32 |        64,896 |   106 |            68 |
| Canonicalization and source review                  |          0 |             0 |    92 |            43 |
| Targeted discovery/relationship follow-up           |          4 |         8,237 |   102 |            54 |
| Final source review and acronym/identifier recovery |          0 |             0 |   104 |            55 |

The completed main experiment and follow-up used **36 real Groq calls / 73,133 tokens**, all HTTP 200, with zero HTTP 429 responses. These totals exclude earlier diagnostic/interrupted runs. No additional requests were sent to generate HTML, images, layouts, correct already-quoted facts, or recover the explicitly present dataset identifier.

The full scan processed 177 body passages (33,600 characters) in 16 bounded batches across PDF pages 1–12; 40 bibliography passages were excluded. The document retained 217 passages overall. It made 16 discovery and 16 relationship requests. No discovered concept was omitted by the 150-node global cap. Repeated aliases/technical suffixes reduced 106 original nodes to 92 canonical entities; this merging is not a loss of distinct scientific entities.

Source review removed 14 unsupported/misattributed edges and 11 duplicate facts, and corrected 31 retained relationship predicates/directions. In particular, the automatic model attributed Random Forest feature importance to Gradient Boosting, confused genes with their encoded proteins, and used generic feature predicates for biochemical facts. The prompts and runtime checks now distinguish condition features from biochemical/method relationships, reject obviously wrong feature roles, preserve uncertainty, and prohibit attribution to a classifier without explicit evidence. These protections reduce errors; they do not eliminate the need for source review.

Four capped follow-up requests revisited five already-parsed discussion/conclusion passages, adding glutamate, serotonin, dopamine, iron complexes, receptor/fusion proteins, gut–brain axis, SCFAs, butyrate and ATP. The actual response also discovered the ABC transporter, but the matcher initially rejected the inserted “(ABC)” acronym. The matcher fix recovered that existing response locally. NCBI BioProject **PRJNA815491** and **PRJNA642975** were visually verified against page 1, with OCR spellings retained as aliases and the label corrections marked as edits. The final review corrected gene/protein endpoints, expanded the explicitly quoted neurotransmitter list, removed repeated facts, clarified that Gaussian Naive Bayes was preferred for the combined pathways/genes dataset and that Cohen’s D compares two groups, and added the quoted K06147→ABC transporter→ATP description. It distinguishes this study's findings from proposed mechanisms and previous studies.

Automatic/raw outputs remain available separately as [unreviewed JSON](../output/evaluation/05v1-automatic-unreviewed.json). Review changes are fully recorded in [initial review log](../output/evaluation/05v1-review-log.json) and [supplement review log](../output/evaluation/05v1-supplement-review-log.json). Retained human corrections carry edited flags. Source evidence remains original OCR text; longer source spans selected during supplement review are verbatim, never invented ellipses or repaired quotations.

The final graph retains 53 grounded nodes without validated relationships. They remain visible and traceable rather than being dropped or connected by invented edges. Thus node retention is broader than the explicit 19-entity benchmark, but the benchmark is the measured completeness claim. All nine headline feature edges cite PDF page 1, paragraph 9. The additional eight benchmark entities are glutamate, serotonin, dopamine, gut–brain axis, SCFAs, butyrate, ATP and ABC transporter, followed by the two verified BioProject identifiers.

All 104 nodes and 55 relationships survived website import/export unchanged. All 55 quotations matched original cited OCR passages. All ten combinations of two shapes/five layouts had zero node bounding-box intersections; initial readable labels were at least 12 CSS pixels. Offline HTML made zero HTTP requests and rendering made zero AI requests. Whole-graph overview necessarily uses smaller text; readable view permits zoom/pan, and full PNG/SVG includes all nodes. Edge crossings and occasional dense hub edge-label clutter can remain; zero node collisions does not claim zero edge crossings.

Completed-run token totals are not a full account billing total; interrupted requests may also have consumed quota.

A full-text Azoospermia attempt encountered Groq HTTP 400 after successful earlier requests. It was stopped; it did not become a completed comparative graph. Oligospermia was inspected as an original visual/source reference. I do not claim completed live generations for either condition.

## Request pacing and cost

For the documented Groq free-tier GPT-OSS models, the published limits are 30 requests/minute, 8,000 tokens/minute, 1,000 requests/day and 200,000 tokens/day. These are organization-level limits; the user's account console is authoritative. Request-remaining headers represent daily requests and token-remaining headers represent minute tokens. [Groq rate-limit documentation](https://console.groq.com/docs/rate-limits).

The app uses a lower local ceiling: 20 requests/minute, 6,000 tokens/minute, 80 requests/day, 100,000 tokens/day, 2.5-second minimum spacing and one in-flight request. It reserves the serialized input estimate plus maximum completion, then reconciles actual returned usage. Small discovery calls reserve at most 1,200 completion tokens; relationship calls at most 2,600. Excerpts are capped at approximately 1,000 context tokens for recommended Groq models; instructions, schema and concepts count toward a separate 3,000 estimated-input cap. Unknown models use smaller request budgets. A large paper consequently sends fewer than 20 calls/minute—often roughly 1–3—because token budgets govern pacing.

Quota waits use the estimated size of the actual request; they do not send requests just to check availability. Long quota exhaustion stops with the draft saved. Rejected keys block further attempts with that key; forbidden model access requires a model/key change. HTTP 429 observes Retry-After and at least a minute cooldown, without automatic retry. Other tabs/applications, shared organization usage, exact tokenizer behavior and unavailable headers can still cause limits. Memory-only counters reset on refresh, so this is protection rather than an account-wide guarantee.

## Validation and reproducibility

- 80 unit tests passed, covering source checks, aliases/identifiers, column segmentation, pacing, rejected keys, editing and export/import.
- 32 Chromium browser scenarios passed, including the actual uploaded OCR PDF, nine online PDFs (273 pages), mixed/rotated scans, a 273-page combined corpus, corrupt/oversized input, both shapes, dense graphs, live settling/dragging, themes, edits/undo, paginated draft history and credential privacy.
- The corpus requests were mocked; only the separately reported Groq experiment measures live model behavior.
- TypeScript and production build passed. Offline HTML includes the viewer, styles, sources and graph; no provider request is necessary for layout, edits or export.

To reproduce automated checks:

```sh
npm ci
npm test
ATLAS_TEST_PORT=5300 ONLINE_PAPERS=1 PAPER_PATH=/absolute/path/05v1.pdf npm run test:e2e
npm run build
```

The local evaluation helper can be rebuilt explicitly (it is removed from the normal production build):

```sh
npx esbuild scripts/evaluation-helpers.ts --bundle --platform=browser --format=esm --outfile=dist/evaluation-helpers.js
node scripts/review-live-graph.mjs
node scripts/review-followup.mjs
# With the production preview available on localhost:5173:
node scripts/render-evaluation.mjs final-reviewed
node scripts/audit-final-benchmark.mjs
```

Review scripts apply corrections to the recorded experiment; they are not a universal automatic scientific reviewer. Artifacts needed by those scripts are kept locally in `.artifacts/live-groq/`.

For opt-in live testing, run `scripts/live-groq-evaluation.mjs` interactively with terminal echo disabled, provide a key on stdin, then the run name. Never commit or save credentials. The driver has no automatic retries. Raw model outputs/usage are stored locally under ignored `.artifacts/live-groq/`; rendering audits/downloads are under ignored `output/evaluation/`.

## Limits of the conclusion

Full traversal and source-grounded node retention reduce omissions; they cannot guarantee that every scientifically important entity is discovered in every paper. Per-section output limits, model mistakes, alias mistakes, OCR character errors, missing section headings and relationships requiring evidence across paragraphs remain possible. Exact-quote validation establishes traceability, not scientific truth. Confidence values are uncalibrated model estimates. The concrete nine-feature benchmark and the source/rendering audits below establish the result for this supplied paper; a broader expert-labeled corpus would be needed for a universal accuracy claim.
