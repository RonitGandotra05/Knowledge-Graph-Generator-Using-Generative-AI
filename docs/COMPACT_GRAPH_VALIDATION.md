# Compact graph rendering

Connection labels use zero text margins and sit at the renderer's actual edge
midpoint. Collision handling changes the curve's control point and weight rather
than displacing the text. An opaque, theme-matched label background makes the
relationship read as an interruption in its own line. Routing checks reject
empty/invalid label bounds, including edges between touching outlines. Routes
update while dragging and after layouts, appearance changes, filtering and themes.

The controls now support 10–160% overall size, 15–160% node size, 0–240 connection
spacing, 4–24 px node text and 4–18 px connection text. All measurements scale
together, including borders, arrowheads and dash patterns. Node sizing protects
text and generally keeps whole words together. Reducing the shell alone cannot
make it smaller than its contents; lowering text size reduces that floor.

Appearance changes contract positions using measured node extents and requested
spacing. Layout and resize fitting cap automatic enlargement, so selecting
Concentric cannot undo a compact size choice. Read labels explicitly zooms into
the same geometry to reach 12 px node text and at least 9 px connection text.
Overview fits the full graph. Arbitrarily tiny text cannot remain readable at a
fixed viewing distance; none is intentionally dropped or detached to make room.

## Verification

- TypeScript check, production build and SEO checks.
- 143 unit tests, including a regression for comparative adverse-event reports
  being incorrectly labelled as directly stated causes.
- Browser regressions cover every layout and node shape, minimum sizes, zero
  spacing, label midpoint alignment, nonempty bounds, node/label and label/label
  collisions, centering, real dragging, both themes, phone view, readable zoom,
  appearance persistence, editing, and offline export/reopening.
- Screenshots were visually inspected at overview and readable zoom for force,
  concentric and grid layouts, in light/dark themes, plus minimum-size and phone
  views. PNG and rendered SVG exports were inspected separately.

## Authorized NEJM evaluation

The supplied `NEJMoa2035389.pdf` parsed locally as 14 pages and 61,495 characters.
The Gemini browser run used the supplied key in memory; no key appears in exports.
Ten successful generation requests produced 28 concepts and 24 quoted
relationships in 39 seconds. Keep the original generation for provenance.

Source review found an unsupported Bell's palsy causal predicate, a
patent-disclosure link, a reference-title-only concept, generic predicates and
several weak/duplicate links. The reviewed copy contains 26 concepts and 19
relationships. Every correction is marked as edited, retains its original
quotation, and is recorded in `review-log.json`. It is a reviewed graph sample,
not an exhaustive clinical-trial summary or a guarantee of model accuracy.
Discovery/extraction prompts now discourage disclosure-only concepts and causal
readings of comparative event reports; validation rejects the directly observed
comparative-occurrence causal error.

Local outputs (ignored by Git):

- `output/evaluation/gemini-nejm/NEJMoa2035389.json` — untouched Gemini result.
- `output/evaluation/gemini-nejm/NEJMoa2035389-reviewed.html` — standalone,
  customizable reviewed graph, with no remote requests when opened as a file.
- Matching reviewed JSON, SVG and PNG; light/dark compact and readable screenshots.
- `review-log.json`, `verification.json`, and `review-verification.json`.

Reproduce rendering/source-review exports after generating the authorized input:

```sh
npm run dev -- --port 5183 --strictPort
node scripts/review-nejm-graph.mjs
ATLAS_TEST_PORT=5183 ATLAS_NEJM_VISUAL=1 npx playwright test tests/e2e/compact-labels.spec.ts
```

The NEJM browser regression is opt-in and requires the local generated JSON;
minimum-size sample regressions run without a key or PDF.

## Public sample

The homepage sample now uses the reviewed COVE trial graph from Baden et al.,
_N Engl J Med_ 2021;384:403–416, DOI `10.1056/NEJMoa2035389`. Removing the eight
remaining disconnected concepts leaves **18 concepts and 19 relationships**.
Both blank-label and isolated-node checks run against the sample. The checked-in
snapshot retains Gemini/model provenance, review edits, unchanged evidence quotes,
source locations, and native PDF line rectangles. Unrelated aliases (such as
Covid-19 as a synonym of the virus, or nasopharyngeal swab as a synonym of RT-PCR)
and an author-affiliations source were also removed.

The included PDF’s SHA-256 fingerprint matches the extraction. Opening the sample
makes no AI requests. Desktop, mobile, light/dark, page-one and page-twelve source
previews were tested and visually inspected. The sample opens with the reviewed
compact concentric settings; all appearance controls remain available. Enabling
physics on explicitly arranged layouts now only resolves overlaps, preserving
compact contact instead of introducing global repulsion. Toolbar disclosures and
selection bars refresh the canvas origin so pointer hits remain accurate after
controls move the canvas.

Rebuild the cached snapshot without making AI requests (requires the separately
reviewed extraction generated above):

```sh
node scripts/update-nejm-sample.mjs
npx prettier --write src/ui/demo-nejm.json
```

An alternate reviewed input and matching source PDF can be passed as arguments.
The script refuses a PDF whose fingerprint does not match and requires locatable
PDF evidence for every retained relationship. The public sample and its browser
regressions work without those local evaluation artifacts or an API key.

Final sample acceptance: 145 unit tests and 30 browser tests passed, along with
the production build, formatting and SEO checks. The three opt-in tests for
regenerating old OCR geometry, the raw evaluation artifact, and the separate
scanned-paper evaluation were skipped. All retained concept and relationship
quotes have locatable PDF highlights, including after JSON round trips.
