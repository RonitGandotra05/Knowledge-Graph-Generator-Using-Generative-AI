import { readFile, writeFile } from "node:fs/promises";
const graph = JSON.parse(
  await readFile("output/evaluation/05v1-graph.json", "utf8"),
).graph;
const names = [
  "Sutterella",
  "Prevotella",
  "Blautia",
  "Substance dependence pathway",
  "Circulatory system pathway",
  "Parasitic infectious disease",
  "K02014",
  "K03585",
  "K06147",
  "glutamate",
  "serotonin",
  "dopamine",
  "gut-brain axis",
  "Short-chain fatty acids",
  "Butyrate",
  "ATP",
  "ATP-binding cassette transporter",
  "PRJNA815491",
  "PRJNA642975",
];
const benchmark = names.map((name, i) => {
  const node = graph.nodes.find((n) =>
    [n.label, ...n.aliases].some((t) =>
      i === 15 ? t === "ATP" : t.toLowerCase().includes(name.toLowerCase()),
    ),
  );
  const headlineEvidence =
    i < 9 && node
      ? graph.edges.filter(
          (e) =>
            e.target === node.id &&
            e.relationship === "has_reported_feature" &&
            e.page === 1 &&
            e.paragraph === 9,
        )
      : [];
  return {
    name,
    id: node?.id,
    present: !!node,
    sourceReferences: node?.sources?.length || 0,
    headlineEvidence: headlineEvidence.map((e) => e.id),
  };
});
if (
  benchmark.some(
    (b, i) =>
      !b.present ||
      !b.sourceReferences ||
      (i < 9 && !b.headlineEvidence.length),
  )
)
  throw Error("Benchmark failed");
await writeFile(
  "output/evaluation/05v1-benchmark.json",
  JSON.stringify(
    {
      scope: "Explicit 19-entity benchmark; not a universal completeness claim",
      benchmark,
    },
    null,
    2,
  ),
);
console.log(
  "19/19 benchmark entities, 9/9 headline features linked to page 1 paragraph 9",
);
