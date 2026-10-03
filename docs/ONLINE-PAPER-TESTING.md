# Online research-paper testing

Recorded 2026-10-02. **9 downloaded papers, 273 PDF pages, 903,074 extracted characters**, covering machine learning, scientific software, physics, biology, and ecology. Eleven corpus browser scenarios passed; machine-readable measurements and download SHA-256 hashes stay in ignored `.artifacts/online-papers/online-paper-results.json`.

## Paper measurements

| Paper / primary source                                                                                                                                             | PDF pages | Extracted characters | Term occurrences | Selected passages | Context reduction | Parse ms |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------: | -------------------: | ---------------: | ----------------: | ----------------: | -------: |
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762)                                                                                                      |        15 |               40,113 |              184 |                31 |               41% |      259 |
| [Generative Adversarial Nets](https://arxiv.org/abs/1406.2661)                                                                                                     |         9 |               29,681 |               60 |                30 |               41% |      206 |
| [Scikit-learn: Machine Learning in Python](https://www.jmlr.org/papers/v12/pedregosa11a.html)                                                                      |         6 |               15,321 |               50 |                23 |                7% |      175 |
| [Observation of Gravitational Waves from a Binary Black Hole Merger](https://arxiv.org/abs/1602.03837)                                                             |        16 |               76,228 |              172 |                27 |               69% |      230 |
| [Tutorial on Variational Autoencoders](https://arxiv.org/abs/1606.05908)                                                                                           |        23 |               49,817 |               56 |                33 |               59% |      213 |
| [Revised Estimates for the Number of Human and Bacteria Cells in the Body](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002533)          |        14 |               47,921 |              190 |                27 |               50% |      196 |
| [A census-based estimate of Earth's bacterial and archaeal diversity](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3000106)               |        30 |              120,715 |              466 |                22 |               80% |      237 |
| [Model uncertainties do not affect observed patterns of species richness in the Amazon](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0183785) |        19 |               69,563 |              318 |                24 |               66% |      221 |
| [Physics, Astrophysics and Cosmology with Gravitational Waves](https://arxiv.org/abs/0903.0338)                                                                    |       141 |              453,715 |              550 |                21 |               95% |     1237 |

Measurements use five reviewed concepts per paper and a 6,000 estimated-token context limit. Context reduction compares selected text plus a conservative metadata allowance against the full extracted text. It does not include all prompt/schema overhead, measure billable provider tokens, or guarantee savings for other concepts. The six-page software paper needs most of its text; the long review needs about 5%. Parse timings are illustrative single Chromium runs on this machine, not a performance benchmark. PDF page counts include a textless final page in the long review.

## What was exercised

Every original PDF was processed in Chromium through the application's parser, then uploaded through the visible UI. Tests checked known title text, all concept occurrences, case-insensitivity, absent terms, unique excerpts, accurate window annotations, PDF page indices, and serialized context limits at 500, 1,000, and 6,000 estimated tokens. Discovery sampling was separately bounded at 1,000 estimated tokens.

Each paper also ran the extraction UI with two intercepted OpenAI requests: concept discovery and relationship extraction, both with deterministic responses. Tests checked the key stays in the authorization header, the sent context includes the source evidence, and the resulting graph displays its exact quote. Validation tests exercised alias deduplication, duplicate relationships, fabricated quotations, wrong passage IDs, missing endpoints, self-edges, and two distinct quotes citing the same passage. Graph imports, evidence inspection, local history, and standalone HTML exports were exercised for every paper. Exported HTML opened from disk with zero HTTP requests and retained working theme/layout controls.

The test relationships are explicitly labeled test doubles. **No live AI calls were made. These checks establish document compatibility and workflow/provenance behavior; they do not establish scientific relationship accuracy or model confidence calibration.** Live provider CORS and model/schema compatibility still need a configured account.

## Derived PDF cases

- **Mixed text/scanned/rotated paper:** used Attention paper pages 1, 2, and 15; page 2 was rasterized, page 15 rotated 90 degrees. A diagnostic parse with OCR explicitly disabled flagged missing text on page 2. Automatic OCR recovered 4,235 additional characters from that page, kept page indices, and left both original text pages unchanged.
- **Combined corpus:** merged all nine papers into a 273-page, 10.3 MB PDF. All 272 text-bearing page indices survived, the final textless page was flagged, all five concepts spanning different papers were found, and serialized context stayed under the 1,000 estimated-token cap.
- **Input boundaries:** rejected a 501-page PDF, a 31 MB file, and a corrupt PDF carrying a plausible PDF header.

## Issues found and fixed

1. Separated retrieval windows inherited the parent paragraph's concept annotations. Each window now records and ranks only its own actual matches.
2. Section labels could remain at Abstract or mistake numbered affiliations, prose, unit values, dates, and references for headings. Parsing now recognizes common and conservative numbered headings, splits text at those headings, and keeps preceding text under its original section. Labels remain heuristic; unusual headings may be missed.
3. Mixed PDFs skipped image-only pages while parsing other pages successfully. The app now recognizes sparse text pages with automatic local OCR, preserving existing text layers. Unreadable pages/files are explicitly excluded without losing readable ones.
4. Long provenance headers could exceed the fixed metadata allowance. Retrieval and discovery now charge at least the actual serialized passage size. The candidate-window count is also preserved before selection consumes the candidate list.

Regression tests cover these failures. The original uploaded 14-page scanned paper is checked separately using PAPER_PATH, alongside the regular browser suite.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm run papers:fetch
npm run test:papers
npm test
PAPER_PATH=/absolute/path/05v1.pdf npm run test:e2e -- --grep 'uploaded research paper'
npm run build
```

The corpus uses public PDF URLs pinned to explicit arXiv versions where available. Downloads, full extracted text, browser artifacts, and generated test HTML stay in ignored .artifacts/online-papers/. The repository report contains measurements and source hashes, without full paper text. OCR may download English language data on first use. Default npm run test:e2e skips online corpus tests unless ONLINE_PAPERS=1; no research PDFs are bundled with the app.
