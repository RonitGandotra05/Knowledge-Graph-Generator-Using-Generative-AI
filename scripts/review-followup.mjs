// Explicit human source review. Preserve automatic results for comparison.
import { readFile, writeFile } from "node:fs/promises";
import {
  mergeGroundedConcepts,
  validateGraph,
  attachProvenance,
} from "../dist/evaluation-helpers.js";
const folder = ".artifacts/live-groq";
const read = async (name) =>
  JSON.parse(await readFile(`${folder}/${name}.json`, "utf8"));
const raw = await read("reviewed"),
  doc = await read("reviewed-document"),
  metrics = await read("followup-metrics");
const result = structuredClone(raw),
  changes = [];
const candidates = metrics.responses.flatMap((r) => r.result?.concepts || []);
const abc = candidates.find((c) =>
  /ATP-binding cassette transporter/i.test(c.label),
);
if (!abc) throw Error("Missing actual model ABC discovery");
const extra = [
  abc,
  {
    label: "NCBI BioProject PRJNA642975",
    type: "Dataset identifier",
    aliases: ["PRINA642975"],
    selected: true,
    edited: true,
  },
];
const grounded = mergeGroundedConcepts(extra, doc);
if (grounded.length !== 2)
  throw Error("Secondary candidates must be source-grounded");
for (const c of grounded)
  result.graph.nodes.push({ ...c, id: `n${result.graph.nodes.length + 1}` });
const id = (label) => {
  const n = result.graph.nodes.find((n) => n.label === label);
  if (!n) throw Error(label);
  return n.id;
};
const paragraph = (pid) => doc.passages.find((p) => p.id === pid);
const edits = {
  e44: "has_reported_high_variance_feature",
  e46: "has_reported_high_variance_feature",
  e52: "produces",
  e53: "includes",
};
const edges = [];
for (const e of result.graph.edges) {
  if (["e50", "e51", "e54"].includes(e.id)) {
    changes.push({
      id: e.id,
      action: "remove duplicate",
      reason: "Equivalent reviewed fact already retained.",
    });
    continue;
  }
  if (e.id === "e45") {
    for (const target of ["glutamate", "serotonin", "dopamine"])
      edges.push({
        ...e,
        source: id("Substance dependence pathway"),
        target: id(target),
        relationship: "involves_neurotransmitter",
        edited: true,
        explanation:
          "The cited discussion explicitly lists this neurotransmitter in the pathway; background mechanism, not a causal ASD finding.",
      });
    changes.push({
      id: e.id,
      action: "correct endpoints and expand quoted list",
      reason:
        "Pathway involves the three named neurotransmitters; ASD is not the grammatical source.",
    });
    continue;
  }
  if (e.id === "e48") {
    e.source = id("outer membrane receptor protein");
    e.relationship = "receptor_for";
    e.evidence =
      "encoding an outer membrane receptor protein for iron complexes";
    e.explanation =
      "The gene encodes a receptor protein for iron complexes; the gene itself is not asserted to bind iron.";
    e.edited = true;
    changes.push({
      id: e.id,
      action: "correct protein endpoint and quote span",
    });
  }
  if (["e17", "e18", "e19"].includes(e.id)) {
    const before = e.relationship;
    e.relationship =
      e.id === "e19"
        ? "suitable_for_combined_dataset_including"
        : "used_to_compare_group";
    e.edited = true;
    e.explanation =
      e.id === "e19"
        ? "The reported preferred dataset combines Top pathways AND Top genes; this edge identifies a component, not an independently preferred pathways-only dataset."
        : "Cohen's D compares the two groups; it is not a separate within-group computation.";
    changes.push({
      id: e.id,
      before,
      after: e.relationship,
      reason: e.explanation,
    });
  }
  if (edits[e.id]) {
    changes.push({ id: e.id, before: e.relationship, after: edits[e.id] });
    e.relationship = edits[e.id];
    e.edited = true;
  }
  if (e.id === "e44" || e.id === "e46")
    e.explanation =
      "Reported high variance in this study; no independent causal or clinical validation is implied.";
  edges.push(e);
}
const p = paragraph("p11-147"),
  evidence = p.text.slice(0, p.text.indexOf("The nervous system")).trim();
for (const [source, target, relationship] of [
  [id("K06147 (ABCB-BAC) gene"), id(abc.label), "encodes"],
  [id(abc.label), id("ATP"), "uses_energy_from"],
]) {
  edges.push({
    id: `review-${edges.length}`,
    source,
    target,
    relationship,
    confidence: 0.9,
    evidence,
    passageId: p.id,
    page: p.page,
    paragraph: p.paragraph,
    section: p.section,
    kind: "stated",
    edited: true,
    explanation:
      "Explicit gene-product/transport-energy description in the discussion; background mechanism, not proven ASD causation.",
  });
  changes.push({
    action: "add source-reviewed relationship",
    source,
    target,
    relationship,
    passageId: p.id,
  });
}
const validated = validateGraph(
  { nodes: result.graph.nodes, edges },
  doc.passages,
  { maxNodes: 150, maxEdges: 500, contextTokens: 1000, includeInferred: false },
  true,
);
if (
  validated.graph.nodes.length !== 104 ||
  validated.graph.edges.length !== edges.length
)
  throw Error(
    JSON.stringify({
      nodes: validated.graph.nodes.length,
      edges: validated.graph.edges.length,
      expected: edges.length,
      warnings: validated.warnings,
    }),
  );
for (const n of validated.graph.nodes)
  if (result.graph.nodes.some((x) => x.id === n.id && x.edited))
    n.edited = true;
for (const e of validated.graph.edges)
  if (
    edges.some(
      (x) =>
        x.source === e.source &&
        x.target === e.target &&
        x.relationship === e.relationship &&
        x.edited,
    )
  )
    e.edited = true;
result.graph = validated.graph;
result.concepts = result.graph.nodes.map((n) => ({ ...n, selected: true }));
result.sources = attachProvenance(result.graph, doc, doc.passages);
result.name = "05v1 · source-reviewed Groq graph";
result.settings.positions = undefined;
result.warnings = [
  "This graph includes explicit human source review. Original automatic results and all review changes are preserved in the evaluation report.",
  "All nine headline features and the additional named benchmark entities are retained. Full traversal reduces omissions but does not guarantee completeness for every paper.",
];
result.coverage = {
  ...result.coverage,
  retainedConcepts: 104,
  followupDiscoveryBatches: 2,
  followupRelationshipBatches: 2,
  omittedConcepts: [],
};
await writeFile(
  `${folder}/final-reviewed.json`,
  JSON.stringify(result, null, 2),
);
await writeFile(
  `${folder}/final-reviewed-document.json`,
  JSON.stringify(doc, null, 2),
);
await writeFile(
  `${folder}/supplement-review-log.json`,
  JSON.stringify(
    {
      rawSupplementedNodes: raw.graph.nodes.length,
      rawSupplementedEdges: raw.graph.edges.length,
      finalNodes: 104,
      finalEdges: result.graph.edges.length,
      addedNodes: grounded,
      changes,
      validationWarnings: validated.warnings,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    nodes: 104,
    edges: result.graph.edges.length,
    validationWarnings: validated.warnings,
  }),
);
