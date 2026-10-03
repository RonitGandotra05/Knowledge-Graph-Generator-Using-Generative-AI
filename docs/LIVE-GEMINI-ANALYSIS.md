# Gemini connection fix and live PDF evaluation

Verified on October 3, 2026 with the user-authorized key. The credential was held in memory, sent only to Google's API, and omitted from scripts, reports, exports and screenshots. The source PDF was not modified or committed.

## Root cause

`GET /v1beta/models` accepted the key and returned `gemini-2.5-flash`. However, generating with that model returned HTTP 404 / `NOT_FOUND`: Google said the model was no longer available to new users and recommended `gemini-3.8-flash`. The original application discarded Google's explanation and displayed a generic model/schema error.

The recommended replacement returned HTTP 200 for schema-constrained JSON and concept discovery, but repeatedly returned HTTP 503 during the full evaluation, with Google's explanation that the model was experiencing high demand. Saved sections remained resumable; resuming did not repeat completed discovery sections. These incomplete attempts are separate from the successful run below.

## Change

- The default is now `gemini-3.1-flash-lite`, which completed the actual PDF workflow. Flash 3.8 and Pro 3.1 remain editable alternatives; the application does not silently switch models.
- Gemini errors display Google's bounded, credential-redacted explanation, including account restrictions, invalid keys and unsupported schema details.
- Model IDs copied as `models/<id>` are normalized before building the generation URL. Thought parts are excluded from JSON parsing.
- Model loading requests up to 1,000 models and filters out known media, live, embedding and specialized model families.
- **Check key & load models** performs a small JSON generation check with the selected Gemini model. A listed but unavailable model no longer produces a misleading success message. The check sends no paper text; the UI discloses that it uses API quota.
- Gemini recovery exposes **Use recommended model**. Cost comparisons use the same default as the provider form, with verified text pricing from [Google](https://ai.google.dev/gemini-api/docs/pricing).
- Two existing browser-test assertions were updated for the current keyword input and the tooltip's privacy heading.

The existing REST `responseMimeType` / `responseJsonSchema` request format was accepted in live requests; the 404 did not require removing structured output or weakening local validation. See [Google's structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

## Successful run

Source: user-supplied `NEJMoa2035389.pdf`, _Efficacy and Safety of the mRNA-1273 SARS-CoV-2 Vaccine_.

| Measurement        | Actual result                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Model              | `gemini-3.1-flash-lite`                                                                                   |
| Browser            | Chromium, production Vite build on localhost                                                              |
| Upload             | Original PDF; no manual text copy/paste                                                                   |
| Parsed content     | 14 pages, 61,495 characters, 233 passages                                                                 |
| Coverage           | 5 discovery batches and 5 relationship batches                                                            |
| Requests           | 10 generation requests, all HTTP 200 / STOP                                                               |
| Elapsed time       | 48,357 ms; UI rounded to 49 seconds                                                                       |
| Result             | 39 grounded concepts, 26 accepted relationships                                                           |
| Usage              | 63,199 input + 9,878 output = 73,077 reported tokens                                                      |
| Paid-plan estimate | USD 0.03061675 for this successful run only                                                               |
| Exports            | Interactive HTML, JSON and screenshot                                                                     |
| Checks             | Nonempty graph; every edge has quote, passage ID and paper ID; no key in HTML/JSON; no browser exceptions |

The key's billing plan was not inferred. The paid-plan estimate excludes earlier probes and unsuccessful Flash 3.8 attempts; Google's billing record remains authoritative.

Local artifacts are under `output/evaluation/gemini-nejm/`: `NEJMoa2035389.html`, `NEJMoa2035389.json`, `verification.json`, and `graph.png`. These generated results are ignored by Git and are not deployed with the application.

The validator rejected 24 unsupported/invalid relationship candidates and retained 16 grounded concepts without accepted relationships. Exact quotation matching verifies provenance, not every model interpretation. Some model predicates are generic and some concepts describe background studies; the result is an exploratory graph, not an exhaustive or independently adjudicated clinical summary.

## Reproduction and regression checks

Start a local production preview, set `ATLAS_TEST_URL`, `ATLAS_TEST_PDF`, and optionally `ATLAS_TEST_MODEL`, then run `node scripts/live-gemini-evaluation.mjs`. Supply the key through non-echoed stdin; never put it in argv or a file. Commands are `upload`, `check`, `run`, `resume`, `status`, `export`, and `quit`. Live analysis sends the selected paper excerpts to Google and uses the supplied account's API quota.

The deterministic suite passes 122 unit tests. Focused browser checks cover Gemini's listed-but-unavailable model, recommendation recovery, actual schema verification and refresh key clearing; Groq quotas/authentication/exports; PDF preview and offline exports; provider estimates, saved numeric capacity and pacing. These intercepted browser responses test application behavior; the successful PDF measurement above used real Gemini responses.

Production publishing is separate from this local fix and evaluation. The hosted site changes only after a deployment.
