// Rebuild the cached public sample from the separately reviewed NEJM extraction.
// No AI requests. The source review remains in scripts/review-nejm-graph.mjs.
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(
  process.argv[2] ||
    `${root}/output/evaluation/gemini-nejm/NEJMoa2035389-reviewed.json`,
);
const paper = resolve(
  process.argv[3] || `${root}/public/samples/NEJMoa2035389.pdf`,
);
const analysis = JSON.parse(await readFile(input, "utf8"));
const bytes = await readFile(paper);
const fingerprint = createHash("sha256").update(bytes).digest("hex");
if (fingerprint !== analysis.papers?.[0]?.fingerprint)
  throw new Error("The supplied PDF does not match the reviewed extraction.");
const connected = new Set(
  analysis.graph.edges.flatMap((e) => [e.source, e.target]),
);
analysis.graph.nodes = analysis.graph.nodes.filter((n) => connected.has(n.id));
const unrelatedAliases = {
  n1: ["2019-nCoV vaccine"],
  n3: ["Covid-19", "coronavirus disease 2019"],
  n4: ["Nasopharyngeal swab"],
  n6: ["per-protocol analysis"],
  n9: ["medically attended adverse events", "Unsolicited adverse events"],
};
for (const node of analysis.graph.nodes) {
  node.aliases = node.aliases.filter(
    (a) => !unrelatedAliases[node.id]?.includes(a),
  );
  // The author affiliations/abstract-background column is not a concept source.
  node.sources = node.sources.filter((s) => s.passageId !== "paper-1:p1-4");
}
analysis.concepts = analysis.graph.nodes.map(({ label, type, aliases }) => ({
  label,
  type,
  aliases,
  selected: true,
}));
const used = new Set([
  ...analysis.graph.edges.map((e) => e.passageId),
  ...analysis.graph.nodes.flatMap((n) => n.sources.map((s) => s.passageId)),
]);
analysis.sources = analysis.sources.filter((s) => used.has(s.id));
analysis.id = "demo";
analysis.name = "mRNA-1273 vaccine · COVE trial";
analysis.papers[0].citation =
  "Baden LR, El Sahly HM, Essink B, et al., for the COVE Study Group. Efficacy and Safety of the mRNA-1273 SARS-CoV-2 Vaccine. N Engl J Med. 2021;384:403–416.";
analysis.papers[0].doi = "10.1056/NEJMoa2035389";
analysis.settings = {
  theme: "dark",
  layout: "concentric",
  nodeShape: "card",
  physics: false,
  confidence: 0,
  hiddenTypes: [],
  edgeLength: 0,
  graphScale: 0.7,
  nodeSize: 0.65,
  nodeFontSize: 12,
  edgeFontSize: 10,
};
analysis.warnings = [
  "Saved Gemini extraction reviewed against the paper; unsupported links and disconnected concepts were removed. Opening this sample makes no AI request. Clinical trial findings describe this study population and follow-up.",
];

// Use the same normalization and geometry as the in-app PDF preview.
const { outputFiles } = await build({
  entryPoints: [resolve(root, "src/documents/pdf-location.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { locatePDFQuote } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);
const task = getDocument({
  data: new Uint8Array(bytes),
  standardFontDataUrl:
    resolve(root, "node_modules/pdfjs-dist/standard_fonts") + "/",
});
try {
  const pdf = await task.promise;
  const pages = new Map();
  for (const passage of analysis.sources) {
    if (!pages.has(passage.page)) {
      const page = await pdf.getPage(passage.page),
        viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.set(
        passage.page,
        content.items
          .filter((i) => i.str && i.width > 0)
          .map((i) => {
            const transform = Util.transform(viewport.transform, i.transform),
              height = Math.hypot(transform[2], transform[3]);
            return {
              text: i.str,
              x: transform[4] / viewport.width,
              y: (transform[5] - height) / viewport.height,
              width: i.width / viewport.width,
              height: height / viewport.height,
            };
          }),
      );
    }
    const lines = pages.get(passage.page);
    const quotes = [
      passage.text,
      ...analysis.graph.edges
        .filter((e) => e.passageId === passage.id)
        .map((e) => e.evidence),
      ...analysis.graph.nodes.flatMap((n) =>
        n.sources.filter((s) => s.passageId === passage.id).map((s) => s.quote),
      ),
    ];
    const chosen = new Set(quotes.flatMap((q) => locatePDFQuote(lines, q)));
    passage.pdfLines = lines.filter((l) => chosen.has(l));
  }
  for (const node of analysis.graph.nodes) {
    for (const ref of node.sources) {
      const passage = analysis.sources.find((s) => s.id === ref.passageId);
      if (!locatePDFQuote(passage.pdfLines, ref.quote).length)
        throw new Error(
          `Cannot locate PDF evidence for ${node.id}:${ref.passageId}.`,
        );
    }
  }
  for (const edge of analysis.graph.edges) {
    const passage = analysis.sources.find((s) => s.id === edge.passageId);
    if (!locatePDFQuote(passage.pdfLines, edge.evidence).length)
      throw new Error(`Cannot locate PDF evidence for ${edge.id}.`);
  }
} finally {
  await task.destroy();
}
await writeFile(
  resolve(root, "src/ui/demo-nejm.json"),
  JSON.stringify(analysis, null, 2) + "\n",
);
const destination = resolve(root, "public/samples/NEJMoa2035389.pdf");
if (paper !== destination) await copyFile(paper, destination);
console.log(
  `Sample: ${analysis.graph.nodes.length} connected concepts, ${analysis.graph.edges.length} relationships.`,
);
