// Local, explicit review of the observed failures. Original Groq output is retained.
import { readFile, writeFile } from "node:fs/promises";
import {
  mergeGroundedConcepts,
  entityKey,
  validateGraph,
  attachProvenance,
} from "../dist/evaluation-helpers.js";
const folder = ".artifacts/live-groq";
const raw = JSON.parse(await readFile(`${folder}/corrected.json`, "utf8"));
const doc = JSON.parse(
  await readFile(`${folder}/corrected-document.json`, "utf8"),
);
const reviewed = structuredClone(raw);
const editNodes = [];
for (const n of reviewed.graph.nodes) {
  if (n.id === "n8") {
    editNodes.push({
      id: n.id,
      oldType: n.type,
      newType: "Functional Pathway",
      reason:
        "The nine-feature functional profile includes this pathway category.",
    });
    n.type = "Functional Pathway";
    n.edited = true;
  }
  if (n.id === "n45") {
    n.aliases.push(n.label);
    editNodes.push({
      id: n.id,
      oldLabel: n.label,
      newLabel: "CytoHubba",
      reason:
        "Correct the OCR spelling against the software named elsewhere in the same paper.",
    });
    n.label = "CytoHubba";
    n.type = "Software";
    n.edited = true;
  }
  if (n.id === "n25") {
    n.aliases.push(n.label, "PRINAS15491");
    editNodes.push({
      id: n.id,
      oldLabel: n.label,
      newLabel: "NCBI BioProject PRJNA815491",
      reason:
        "Identifier visually verified on PDF page 1; OCR quotation is retained unchanged.",
    });
    n.label = "NCBI BioProject PRJNA815491";
    n.type = "Dataset identifier";
    n.edited = true;
  }
}
const concepts = mergeGroundedConcepts(
  reviewed.graph.nodes.map((n) => ({ ...n, selected: true })),
  doc,
);
const nodes = concepts.map((c, i) => ({ ...c, id: `n${i + 1}` }));
const ids = new Map(
  reviewed.graph.nodes.map((n) => [
    n.id,
    nodes.find(
      (c) =>
        [c.label, ...c.aliases].some((t) =>
          [n.label, ...n.aliases].includes(t),
        ) || entityKey(c.label, c.type) === entityKey(n.label, n.type),
    )?.id,
  ]),
);
const edits = [],
  removed = [];
const bad = {
  e12: "The quote links the microbiome to ASD, not a distinct microbiome-to-dysbiosis relationship.",
  e14: "The quote reports GI comorbidity, not higher dysbiosis frequency.",
  e19: "LEfSE is not a numeric p-value cutoff.",
  e31: "Counts of LEfSE findings cannot be attributed unchanged to T-test.",
  e32: "Counts of LEfSE findings cannot be attributed unchanged to T-test.",
  e33: "Counts of LEfSE findings cannot be attributed unchanged to T-test.",
  e36: "The feature ranking is not explicitly assigned to Gradient Boosting.",
  e37: "The feature ranking is not explicitly assigned to Gradient Boosting.",
  e38: "The feature ranking is not explicitly assigned to Gradient Boosting.",
  e39: "The feature ranking is not explicitly assigned to Gradient Boosting.",
  e40: "The feature ranking is not explicitly assigned to Gradient Boosting.",
  e41: "The feature ranking is not explicitly assigned to Gradient Boosting.",
  e45: "The excerpt does not uniquely assign this plot to Gaussian Naive Bayes.",
  e46: "The excerpt does not uniquely assign this matrix to Gaussian Naive Bayes.",
};
const alpha = ids.get("n68");
const replacements = {
  e18: "used_in",
  e24: "estimates_feature_importance_for",
  e25: "estimates_feature_importance_for",
  e26: "has_alpha_diversity_assessed_with",
  e27: "has_alpha_diversity_assessed_with",
  e28: "identifies_biomarker_group",
  e29: "identifies_biomarker_group",
  e30: "identifies_biomarker_group",
  e34: "uses_metric",
  e35: "identifies_top_node",
  e42: "reported_higher_in",
  e43: "quantifies",
  e44: "quantifies",
  e47: "reported_prior_association_with",
  e48: "involved_in",
  e49: "reported_elevated_in_this_study",
  e50: "reported_increased_in_this_study",
  e51: "discussed_in_relation_to",
  e56: "discussed_in_relation_to",
  e57: "helps_preserve_integrity_of",
  e59: "encodes_component_of",
  e60: "reported_increased_in_this_study",
};
const edges = [];
for (const original of reviewed.graph.edges) {
  if (bad[original.id]) {
    removed.push({ edge: original, reason: bad[original.id] });
    continue;
  }
  const e = {
    ...original,
    source: ids.get(original.source),
    target: ids.get(original.target),
  };
  const number = Number(original.id.slice(1));
  if (number <= 9 || (number >= 52 && number <= 55))
    e.relationship = "has_reported_feature";
  if (number >= 61 && number <= 66) {
    [e.source, e.target] = [e.target, e.source];
    e.relationship = "has_reported_feature";
  }
  if (replacements[original.id]) e.relationship = replacements[original.id];
  if (original.id === "e43" || original.id === "e44") e.target = alpha;
  if (
    e.relationship !== original.relationship ||
    e.target !== ids.get(original.target) ||
    e.source !== ids.get(original.source)
  ) {
    e.edited = true;
    edits.push({
      id: original.id,
      before: original.relationship,
      after: e.relationship,
      reason:
        "Source-grounded semantic/predicate correction; original quote unchanged.",
    });
  }
  if (!e.source || !e.target) {
    removed.push({
      edge: original,
      reason: "Endpoint depended on an ungrounded generic alias.",
    });
    continue;
  }
  if (
    edges.some(
      (x) =>
        x.source === e.source &&
        x.target === e.target &&
        x.relationship === e.relationship,
    )
  ) {
    removed.push({
      edge: original,
      reason:
        "Duplicate fact after canonical entity and predicate merging; stronger earlier evidence retained.",
    });
    continue;
  }
  edges.push(e);
}
const result = validateGraph(
  { nodes, edges },
  doc.passages,
  { maxNodes: 150, maxEdges: 500, contextTokens: 1000, includeInferred: false },
  true,
);
// Restore marked human corrections after validation assigns stable IDs.
for (const n of result.graph.nodes)
  if (nodes.some((x) => x.label === n.label && x.edited)) n.edited = true;
for (const e of result.graph.edges)
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
reviewed.graph = result.graph;
reviewed.concepts = concepts;
reviewed.sources = attachProvenance(reviewed.graph, doc, doc.passages);
reviewed.name = "05v1 · reviewed Groq graph";
reviewed.warnings.push(
  "This export includes explicit human source review, entity merging and predicate corrections. Original quotations remain unchanged. See LIVE_GROQ_ANALYSIS.md.",
);
reviewed.settings.positions = undefined;
await writeFile(
  `${folder}/reviewed-base.json`,
  JSON.stringify(reviewed, null, 2),
);
await writeFile(
  `${folder}/review-log.json`,
  JSON.stringify(
    {
      rawNodes: raw.graph.nodes.length,
      rawEdges: raw.graph.edges.length,
      canonicalNodes: reviewed.graph.nodes.length,
      canonicalEdges: reviewed.graph.edges.length,
      editNodes,
      edits,
      removed,
      validationWarnings: result.warnings,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    canonicalNodes: reviewed.graph.nodes.length,
    canonicalEdges: reviewed.graph.edges.length,
    removed: removed.length,
    edits: edits.length,
    validationWarnings: result.warnings,
  }),
);
