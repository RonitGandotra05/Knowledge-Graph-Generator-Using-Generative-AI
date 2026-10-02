import { readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
const root = new URL("../", import.meta.url);
const readJSON = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const manifest = await readJSON("tests/fixtures/online-papers.json");
const downloads = await readJSON(".artifacts/online-papers/downloads.json");
const papers = [];
for (const paper of manifest) {
  const result = await readJSON(
    ".artifacts/online-papers/results/" + paper.id + ".json",
  );
  const main = result.selections.find((s) => s.budget === 6000);
  const download = downloads.find((d) => d.id === paper.id);
  papers.push({
    id: paper.id,
    title: paper.title,
    field: paper.field,
    source: paper.source,
    pdf: paper.pdf,
    sha256: download.sha256,
    bytes: download.bytes,
    testedAt: result.testedAt,
    pages: result.doc.pages,
    textBearingPages: new Set(result.doc.passages.map((p) => p.page)).size,
    documentCharacters: result.doc.characters,
    parseMs: Math.round(result.parseMs),
    concepts: paper.terms,
    occurrences: main.totalOccurrences,
    selectedPassages: main.passages.length,
    selectedCharactersIncludingMetadataAllowance: main.characters,
    contextReductionPercent: Math.round(
      (1 - main.characters / result.doc.characters) * 100,
    ),
    budgets: result.selections.map((s) => ({
      estimatedTokensCap: s.budget,
      estimatedTokensUsed: s.estimatedTokens,
      selectedCharactersIncludingMetadataAllowance: s.characters,
      serializedContextCharacters: s.serializedCharacters,
      selectedPassages: s.passages.length,
      retrievalMs: Math.round(s.retrievalMs),
      missingDocumentTerms: s.missing,
      incorrectlyAnnotatedTerms: s.unmatchedAnnotations.length,
    })),
    warnings: result.doc.warnings,
  });
}
const mixed = await readJSON(
  ".artifacts/online-papers/results/mixed-page-variant.json",
);
const combined = await readJSON(
  ".artifacts/online-papers/results/combined-variant.json",
);
const report = {
  recordedAt: new Date().toISOString(),
  scope:
    "Real downloaded PDFs, local parsing/retrieval/OCR/provenance, full extraction UI with mocked AI, graph controls, exports and history. No live semantic AI evaluation.",
  paperCount: papers.length,
  totalPages: papers.reduce((s, p) => s + p.pages, 0),
  totalDocumentCharacters: papers.reduce((s, p) => s + p.documentCharacters, 0),
  papers,
  variants: { mixed, combined },
};
await writeFile(
  new URL("docs/online-paper-results.json", root),
  await format(JSON.stringify(report), { parser: "json" }),
);
const rows = papers
  .map(
    (p) =>
      `| [${p.title}](${p.source}) | ${p.pages} | ${p.documentCharacters.toLocaleString("en-US")} | ${p.occurrences} | ${p.selectedPassages} | ${p.contextReductionPercent}% | ${p.parseMs} |`,
  )
  .join("\n");
const markdown = `# Online research-paper testing

Recorded ${report.recordedAt.slice(0, 10)}. **${report.paperCount} downloaded papers, ${report.totalPages} PDF pages, ${report.totalDocumentCharacters.toLocaleString("en-US")} extracted characters**, covering machine learning, scientific software, physics, biology, and ecology. Eleven corpus browser scenarios passed; see [machine-readable measurements and download SHA-256 hashes](online-paper-results.json).

## Paper measurements

| Paper / primary source | PDF pages | Extracted characters | Term occurrences | Selected passages | Context reduction | Parse ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

Measurements use five reviewed concepts per paper and a 6,000 estimated-token context limit. Context reduction compares selected text plus a conservative metadata allowance against the full extracted text. It does not include all prompt/schema overhead, measure billable provider tokens, or guarantee savings for other concepts. The six-page software paper needs most of its text; the long review needs about 5%. Parse timings are illustrative single Chromium runs on this machine, not a performance benchmark. PDF page counts include a textless final page in the long review.

## What was exercised

Every original PDF was processed in Chromium through the application's parser, then uploaded through the visible UI. Tests checked known title text, all concept occurrences, case-insensitivity, absent terms, unique excerpts, accurate window annotations, PDF page indices, and serialized context limits at 500, 1,000, and 6,000 estimated tokens. Discovery sampling was separately bounded at 1,000 estimated tokens.

Each paper also ran the extraction UI with two intercepted OpenAI requests: concept discovery and relationship extraction, both with deterministic responses. Tests checked the key stays in the authorization header, the sent context includes the source evidence, and the resulting graph displays its exact quote. Validation tests exercised alias deduplication, duplicate relationships, fabricated quotations, wrong passage IDs, missing endpoints, self-edges, and two distinct quotes citing the same passage. Graph imports, evidence inspection, local history, and standalone HTML exports were exercised for every paper. Exported HTML opened from disk with zero HTTP requests and retained working theme/layout controls.

The test relationships are explicitly labeled test doubles. **No live AI calls were made. These checks establish document compatibility and workflow/provenance behavior; they do not establish scientific relationship accuracy or model confidence calibration.** Live provider CORS and model/schema compatibility still need a configured account.

## Derived PDF cases

- **Mixed text/scanned/rotated paper:** used Attention paper pages 1, 2, and 15; page 2 was rasterized, page 15 rotated 90 degrees. A diagnostic parse with OCR explicitly disabled flagged missing text on page 2. Automatic OCR recovered ${mixed.recoveredCharacters.toLocaleString("en-US")} additional characters from that page, kept page indices, and left both original text pages unchanged.
- **Combined corpus:** merged all nine papers into a ${combined.pages}-page, ${(combined.bytes / 1024 / 1024).toFixed(1)} MB PDF. All 272 text-bearing page indices survived, the final textless page was flagged, all five concepts spanning different papers were found, and serialized context stayed under the 1,000 estimated-token cap.
- **Input boundaries:** rejected a 501-page PDF, a 31 MB file, and a corrupt PDF carrying a plausible PDF header.

## Issues found and fixed

1. Separated retrieval windows inherited the parent paragraph's concept annotations. Each window now records and ranks only its own actual matches.
2. Section labels could remain at Abstract or mistake numbered affiliations, prose, unit values, dates, and references for headings. Parsing now recognizes common and conservative numbered headings, splits text at those headings, and keeps preceding text under its original section. Labels remain heuristic; unusual headings may be missed.
3. Mixed PDFs skipped image-only pages while parsing other pages successfully. The app now recognizes sparse text pages with automatic local OCR, preserving existing text layers. Unreadable pages/files are explicitly excluded without losing readable ones.
4. Long provenance headers could exceed the fixed metadata allowance. Retrieval and discovery now charge at least the actual serialized passage size. The candidate-window count is also preserved before selection consumes the candidate list.

Regression tests cover these failures. The original uploaded 14-page scanned paper is checked separately using PAPER_PATH, alongside the regular browser suite.

## Reproduce

\
\`\`\`sh
npm ci
npx playwright install chromium
npm run papers:fetch
npm run test:papers
npm test
PAPER_PATH=/absolute/path/05v1.pdf npm run test:e2e -- --grep 'uploaded research paper'
npm run build
\`\`\`

The corpus uses public PDF URLs pinned to explicit arXiv versions where available. Downloads, full extracted text, browser artifacts, and generated test HTML stay in ignored .artifacts/online-papers/. The repository report contains measurements and source hashes, without full paper text. OCR may download English language data on first use. Default npm run test:e2e skips online corpus tests unless ONLINE_PAPERS=1; no research PDFs are bundled with the app.
`;
await writeFile(
  new URL("docs/ONLINE-PAPER-TESTING.md", root),
  await format(markdown, { parser: "markdown" }),
);
console.log(
  `Recorded ${report.paperCount} papers / ${report.totalPages} pages in docs/ONLINE-PAPER-TESTING.md`,
);
