import type {
  Concept,
  ExtractionOptions,
  GraphNode,
  KnowledgeGraph,
  Passage,
} from "../types";
import { normalizeLabel, occurrences } from "../retrieval/context";
import { quoteKey } from "../documents/text";
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown, max = 400) =>
  typeof x === "string" ? x.trim().slice(0, max) : "";
export function parseJSON(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(
      "The model returned malformed JSON. Try again or choose a model with structured output support.",
    );
  }
}
export function validateConcepts(raw: unknown, max: number): Concept[] {
  if (!record(raw) || !Array.isArray(raw.concepts))
    throw new Error("The model response is missing a concepts array.");
  const seen = new Set<string>(),
    concepts: Concept[] = [];
  for (const c of raw.concepts) {
    if (!record(c) || !str(c.label)) continue;
    const label = str(c.label, 100),
      key = normalizeLabel(label);
    if (seen.has(key)) continue;
    seen.add(key);
    concepts.push({
      label,
      type: str(c.type, 60) || "Concept",
      aliases: Array.isArray(c.aliases)
        ? c.aliases
            .filter((a): a is string => typeof a === "string")
            .slice(0, 8)
            .map((a) => str(a, 100))
        : [],
      selected: true,
    });
    if (concepts.length >= max) break;
  }
  if (!concepts.length)
    throw new Error(
      "No concepts detected. Try adding manual terms or increasing discovery context.",
    );
  return concepts;
}
export function validateGraph(
  raw: unknown,
  passages: Passage[],
  options: ExtractionOptions,
  requireEndpoints = false,
): { graph: KnowledgeGraph; warnings: string[] } {
  if (!record(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges))
    throw new Error("The model response must contain nodes and edges arrays.");
  if (raw.nodes.length > 10000 || raw.edges.length > 20000)
    throw new Error("Graph response is too large.");
  const nodes: GraphNode[] = [],
    ids = new Map<string, string>(),
    names = new Map<string, GraphNode>();
  const warnings: string[] = [];
  let removed = 0;
  for (const n of raw.nodes) {
    if (!record(n) || !str(n.label) || !str(n.id)) {
      removed++;
      continue;
    }
    const label = str(n.label, 120),
      aliases = Array.isArray(n.aliases)
        ? n.aliases
            .filter((x): x is string => typeof x === "string")
            .slice(0, 8)
            .map((x) => str(x, 120))
        : [];
    const existing = [label, ...aliases]
      .map(normalizeLabel)
      .map((x) => names.get(x))
      .find(Boolean);
    if (existing) {
      ids.set(str(n.id), existing.id);
      [label, ...aliases].forEach((a) => {
        names.set(normalizeLabel(a), existing);
        if (
          normalizeLabel(a) !== normalizeLabel(existing.label) &&
          !existing.aliases.includes(a)
        )
          existing.aliases.push(a);
      });
      continue;
    }
    if (ids.has(str(n.id)) || nodes.length >= options.maxNodes) {
      removed++;
      continue;
    }
    const node = {
      id: `n${nodes.length + 1}`,
      label,
      type: str(n.type, 60) || "Concept",
      aliases,
    };
    nodes.push(node);
    ids.set(str(n.id), node.id);
    [label, ...aliases].forEach((x) => names.set(normalizeLabel(x), node));
  }
  const edges: KnowledgeGraph["edges"] = [],
    seen = new Set<string>();
  for (const e of raw.edges) {
    if (!record(e)) {
      removed++;
      continue;
    }
    const source = ids.get(str(e.source)),
      target = ids.get(str(e.target));
    let relationship = str(e.relationship, 100)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_|_$/g, "");
    const evidence = str(e.evidence, 4000),
      passage = passages.find((p) => p.id === str(e.passageId));
    const kind =
      e.kind === "implied"
        ? "implied"
        : e.kind === "inferred"
          ? "inferred"
          : "stated";
    const confidence = e.confidence;
    if (
      !["stated", "implied", "inferred"].includes(String(e.kind)) ||
      !source ||
      !target ||
      source === target ||
      !relationship ||
      typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      evidence.length < 15 ||
      !passage ||
      !quoteKey(passage.text).includes(quoteKey(evidence)) ||
      (kind === "inferred" && !options.includeInferred)
    ) {
      removed++;
      continue;
    }
    const sourceNode = nodes.find((n) => n.id === source)!;
    const targetEntity = nodes.find((n) => n.id === target)!;
    if (
      requireEndpoints &&
      ![sourceNode, targetEntity].every((n) =>
        [n.label, ...n.aliases].some(
          (term) => occurrences(passage.text, term).length,
        ),
      )
    ) {
      removed++;
      continue;
    }
    if (
      /^(?:has|reported_as)_biomarker_for$/.test(relationship) &&
      /disease|condition|disorder/i.test(sourceNode.type)
    )
      relationship = "has_reported_feature";
    if (
      relationship === "identified_as_biomarker_for" &&
      /method|test|software|tool|classifier/i.test(sourceNode.type)
    )
      relationship = "identifies";
    // Exact words alone do not establish a correct semantic role. Catch clear
    // category mistakes and unconditional causal readings of hedged evidence.
    const targetNode = nodes.find((n) => n.id === target)!;
    const nonMetric =
      /disease|condition|organism|microbe|gene|protein|pathway|biological system/i.test(
        targetNode.type,
      );
    const wrongFeatureRole =
      relationship === "has_reported_feature" &&
      /taxon|microorganism|metabolite|gene|protein|pathway|method|software|tool|classifier/i.test(
        sourceNode.type,
      );
    const wrongMetricRole =
      /^(?:uses|has|applies)_metric$/.test(relationship) && nonMetric;
    const causal =
      /^(?:causes|leads_to|induces|drives|promotes|prevents|cures|results_in)$/u.test(
        relationship,
      );
    const hedged =
      /\b(?:may|might|could|can|possibly|potentially|hypothes\w*|suggest\w*)\b/iu.test(
        evidence,
      );
    if (
      e.edited !== true &&
      (wrongFeatureRole ||
        wrongMetricRole ||
        (causal && hedged && kind !== "inferred"))
    ) {
      removed++;
      continue;
    }
    const key = [source, target, relationship, passage.paperId || ""].join("|");
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    edges.push({
      id: `e${edges.length + 1}`,
      source,
      target,
      relationship,
      confidence,
      evidence,
      passageId: passage.id,
      page: passage.page,
      paperId: passage.paperId,
      paperName: passage.paperName,
      section: passage.section,
      paragraph: passage.paragraph,
      kind,
      explanation: str(e.explanation, 1200),
    });
    if (edges.length >= options.maxEdges) break;
  }
  if (removed)
    warnings.push(
      `${removed} duplicate, invalid, unsupported, or over-limit graph items were removed.`,
    );
  const connected = new Set(edges.flatMap((e) => [e.source, e.target]));
  const disconnected = nodes.filter((n) => !connected.has(n.id)).length;
  if (disconnected)
    warnings.push(`${disconnected} concepts have no validated relationships.`);
  if (!edges.length)
    warnings.push(
      "No evidence-backed relationships survived validation. Try other concepts or more context.",
    );
  return { graph: { nodes, edges }, warnings };
}
