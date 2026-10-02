# Evidence Atlas — workspace and visual redesign

Implemented in the Desktop repository on 2026-10-03. The result keeps the homepage, replaces the workspace wizard with a complete setup form, makes the presentation charcoal/warm-light, and retains evidence, graph editing, history and ongoing analysis.

## Delivered changes

| Request                                   | Result                                                                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any research discipline                   | Generic discovery categories and domain-appropriate relationship instructions; no fixed biological ontology. Biomedical feature-list guidance applies only to biomedical excerpts.                          |
| Preserve the homepage                     | Separate homepage with the original “Your paper. A new perspective.” headline, research/sample actions, history and theme controls.                                                                         |
| Modern dimensional presentation           | An original CSS research orb, orbital rings, paper stack and method/finding/evidence satellites. Gentle pointer depth and reduced-motion support; no external 3D runtime.                                   |
| All workspace inputs together             | Upload, optional focus/keywords, provider, model, key, estimate and Build in one view. Optional connection/context details stay collapsed.                                                                  |
| Remove needless desktop scrolling         | Homepage and complete setup fit the checked desktop sizes at normal zoom. Live/completed graph views use remaining viewport space rather than stacking fixed-height panels.                                 |
| Blacker dark mode and polished light mode | Charcoal surfaces, muted mint accents and warm paper backgrounds. The same palette carries into graph rendering and offline HTML.                                                                           |
| Prettier graphs                           | Native shaded circular/card nodes, distinct individual colors, wrapped text, label-aware collision spacing and optional damped physics. Small two-node graphs adapt to wide/short and tall/narrow canvases. |
| Keep progress through navigation          | Returning home keeps the same live workspace/controller. The homepage action reports the active run; opening its Ongoing history item reopens it without restarting requests.                               |
| History and recovery                      | Menu-based, six-item history pagination; New graph saves previous work; refresh resumes stored checkpoints with a fresh memory-only API key.                                                                |
| Beautiful README                          | Screenshot-led overview, light-theme gallery, architecture, quickstart, provider/cost/privacy explanation and links to measured test reports.                                                               |
| Code reuse requires permission            | Custom permission-required LICENSE, an unsigned approval-record template, in-app explanation and separate dependency notices. Hosted-app use and sharing generated exports are expressly allowed.           |
| Meaningful commits                        | 27 feature/test/documentation commits with short messages and actual timestamps. No fabricated past activity, altered authorship or backdating. Commits remain local; no push or deployment was performed.  |

PenSpectra’s local presentation was inspected as visual inspiration for depth, lighting and composition. The research constellation, colors and layout are original to Evidence Atlas; its source and branding were not copied.

## Desktop and mobile measurements

Browser tests run at native CSS viewport sizes, with no zoom or overflow-clipping workaround.

| Viewport   | Homepage          | Empty setup                   | Uploaded paper + Groq setup            |
| ---------- | ----------------- | ----------------------------- | -------------------------------------- |
| 1440 × 900 | Fits; both themes | Fits; required fields visible | Fits; estimate, plan and Build visible |
| 1366 × 768 | Fits; both themes | Fits; required fields visible | Fits; estimate, plan and Build visible |
| 1280 × 720 | Fits; both themes | Fits; required fields visible | Fits; estimate, plan and Build visible |

A live and completed controlled two-node analysis at 1366×768 also measured **768 pixels of document height**, matching the viewport. Both completed nodes are fully visible, and the graph’s accessible list is within the viewport. Progress, usage and source-note summaries remain available. The graph uses its remaining vertical space; expanding detailed information may legitimately require scrolling.

At 390×844, content flows vertically with no horizontal overflow. Controls are not made unreadably small or hidden merely to force the mobile interface onto one screen. Larger graphs keep readable labels and support panning/Overview/fullscreen rather than compressing every label into a tiny overview. Evidence and accessible-list panels can scroll when their content requires it.

![Charcoal homepage](screenshots/home-dark.png)

![One-page workspace](screenshots/workspace-dark.png)

![Curated illustrative graph with shaded circular nodes](screenshots/graph-dark.png)

The nine-node graph screenshot is the manually curated sample, not a fresh live AI generation. The preceding two-node rendering/navigation fixture uses intercepted responses. This report does not relabel either as real LLM output.

## Extraction and evidence

The model discovers concepts and extracts relationships from bounded source sections. Locally assigned node IDs and a relationship-only schema avoid regenerating the entire node inventory. Layout, physics, HTML/image generation, editing, quote matching, page identity, history and usage displays are local operations.

The focus is optional and guides extraction; it does not become evidence. Source records preserve the uploaded filename, original PDF page index, parsed paragraph and actual supporting text. Each node can retain up to five supporting paragraphs per paper; independently cited relationships from different papers survive merging. Grounded isolated nodes stay in the graph. Limits produce named omission warnings.

New controlled fixtures cover astrophysics, materials research and social science. The public corpus separately includes machine learning, software, gravitational-wave physics and ecology. Prompt changes in this redesign were not newly evaluated with a live provider key. Previous authorized live Groq measurements remain in [LIVE_GROQ_ANALYSIS.md](LIVE_GROQ_ANALYSIS.md): 104 reviewed nodes, 55 relationships and a 19/19 explicitly defined entity benchmark. Those measurements belong to the earlier reviewed run, not to every future upload.

Whole-paper traversal and exact quote checks cannot guarantee perfect recall or semantic correctness. OCR errors, ambiguous study findings and model omissions still need review. The implementation retains supported evidence and reports bounds; it does not promise that no important node can ever be missed.

## Verification

- **100 unit tests passed:** parsing/retrieval, collection identity, provenance, domain-neutral validation, graph editing, imports/exports, third-party notice retention, provider adapters, usage accounting and request guards.
- **39 browser scenarios passed with the full corpus enabled:** nine online papers, the uploaded scanned paper, ten actual PDFs together (287 pages), automatic OCR, failures/partial recovery, history, keys, edits, physics, offline export and presentation/navigation.
- After the final viewport correction, **13 targeted browser scenarios passed** for presentation, small/dense graphs, physics, editing, multi-paper streaming and recovery; the optional real-corpus scenario was skipped in that targeted command. The full 39-scenario corpus run then passed again.
- **Four production browser scenarios passed:** both-theme desktop fit, ongoing homepage/history navigation, reduced-motion/mobile containment, and the ten-PDF live graph/usage/offline-export workflow.
- Strict TypeScript, production build and formatting checks passed. The build includes the application terms and full installed runtime dependency notices. Standalone HTML retains Cytoscape’s copyright and MIT permission text.
- All **31 original tracked files** match commit `8a833c0` byte for byte under `legacy/`. No original condition graph was discarded. Tracked files contain no live Groq API key.

Automated requests use dummy keys and intercepted model responses. They do not spend API credits. Actual PDF/OCR processing and browser rendering are exercised; mocked token/cost fixtures are clearly distinguished from the earlier real Groq evaluation.

Reproduce:

```sh
npm ci
npx playwright install chromium
npm run papers:fetch
npm test
ATLAS_TEST_PORT=5300 ONLINE_PAPERS=1 PAPER_PATH=/absolute/path/05v1.pdf npm run test:e2e
npm run build
npm run format:check
```

For production browser checks, serve `dist/` with `npm run preview -- --port 5400 --strictPort`, then run:

```sh
ATLAS_TEST_PORT=5400 npx playwright test \
  tests/e2e/presentation.spec.ts tests/e2e/multi-paper-live.spec.ts \
  --grep 'home and complete setup|active analysis|decorative scene|ten PDFs stream'
```

## License and original graphs

MIT gives broad advance reuse permission, so it would contradict the requested approval-before-reuse policy. The repository instead contains [custom permission-required terms](../LICENSE) and an [unsigned permission-record template](CODE-USE-PERMISSION.md). This is not an issued certificate or an automatic approval. Dependencies retain their original terms, collected in the built distribution; generated graph exports may be shared under the stated exception.

Original visual references remain available: [azoospermia](../legacy/azoospermia/html/azoospermia-graph.html), [oligospermia](../legacy/oligospermia/html/oligospermia-graph.html), and the other condition graphs under `legacy/`. The detailed comparison of their visual behavior, evidence limitations and the earlier live Groq result remains in the [evaluation report](LIVE_GROQ_ANALYSIS.md).
