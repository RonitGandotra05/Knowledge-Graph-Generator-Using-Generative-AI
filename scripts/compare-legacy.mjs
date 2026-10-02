// Read-only local comparison: literal coverage is not a scientific accuracy score.
import { readFile, readdir, writeFile } from "node:fs/promises";
const root = ".artifacts/live-groq";
const norm = (s) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
const comparisons = [];
for (const condition of [
  "azoospermia",
  "oligospermia",
  "asthenozoospermia",
  "hypospermia",
  "teratospermia",
]) {
  const graph = JSON.parse(
    await readFile(`${root}/legacy-${condition}.json`, "utf8"),
  );
  const base = `legacy/${condition}/research_papers`;
  const files = (await readdir(base)).filter(
    (f) => f.endsWith(".txt") && !/map|documentation/i.test(f),
  );
  const texts = await Promise.all(
    files.map(async (f) => ({
      file: f,
      text: norm(await readFile(`${base}/${f}`, "utf8")),
    })),
  );
  const nodes = graph.nodes.map((n) => ({
    label: n.label,
    literalMentionsIn: texts
      .filter((t) => t.text.includes(norm(n.label)))
      .map((t) => t.file),
  }));
  comparisons.push({
    condition,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    files,
    nodesWithLiteralMention: nodes.filter((n) => n.literalMentionsIn.length)
      .length,
    nodeMentions: nodes,
    perEdgeQuoteFields: graph.edges.filter(
      (e) => e.evidence || e.passageId || e.page,
    ).length,
  });
}
await writeFile(
  `${root}/legacy-content-comparison.json`,
  JSON.stringify(comparisons, null, 2),
);
console.log(
  JSON.stringify(
    comparisons.map(
      ({
        condition,
        nodes,
        edges,
        nodesWithLiteralMention,
        perEdgeQuoteFields,
      }) => ({
        condition,
        nodes,
        edges,
        nodesWithLiteralMention,
        perEdgeQuoteFields,
      }),
    ),
    null,
    2,
  ),
);
