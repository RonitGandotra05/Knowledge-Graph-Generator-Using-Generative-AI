import type {
  Concept,
  ExtractionOptions,
  KnowledgeGraph,
  GraphNode,
  Passage,
  ResearchDocument,
} from "../types";
import {
  occurrences,
  formatContext,
  normalizeLabel,
} from "../retrieval/context";
import { validateGraph } from "../graph/validate";
import { quoteKey } from "../documents/text";
import { LLMProvider } from "./client";
import { discover } from "./extract";
import { graphSchema } from "./schema";

// Exhaustive passage traversal, with bounded request sizes. Never silently sample.
// Keep original passage IDs/page/paragraphs so every accepted quote is traceable.
export function coverageBatches(
  doc: ResearchDocument,
  tokens: number,
): Passage[][] {
  const budget = Math.max(800, tokens * 3),
    batches: Passage[][] = [];
  let batch: Passage[] = [],
    size = 0;
  for (const passage of doc.passages) {
    if (/^(?:\d+[.)]?\s*)?references$/i.test(passage.section.trim())) continue;
    if (batch.length && batch[0].paperId !== passage.paperId) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    const cost = formatContext([passage]).length;
    if (batch.length && size + cost > budget) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    // Parser bounds source paragraphs to ~1,100 characters. Smaller custom
    // budgets use source-preserving windows rather than dropping the paragraph.
    if (cost > budget) {
      const width = Math.max(300, budget - 200);
      for (let start = 0; start < passage.text.length; start += width - 120) {
        batches.push([
          {
            ...passage,
            id: `${passage.id}@${start}`,
            text: passage.text.slice(start, start + width),
          },
        ]);
      }
    } else {
      batch.push(passage);
      size += cost;
    }
  }
  if (batch.length) batches.push(batch);
  return batches;
}
export function entityKey(term: string, type: string): string {
  let key = normalizeLabel(term)
    .replace(/[‐‑–—-]/g, " ")
    .replace(/\s+/g, " ");
  key = key.replace(/\bcurves\b/g, "curve");
  key = key.replace(
    /(?:\s+(?:analysis|software|method|classifier|plugin))+$/,
    "",
  );
  if (/pathway/i.test(type)) key = key.replace(/\s+pathways?$/, "");
  return key.trim();
}
const entityFamily = (type: string) =>
  /pathway/i.test(type)
    ? "pathway"
    : /gene|protein/i.test(type)
      ? "gene"
      : /condition|disease|disorder/i.test(type)
        ? "condition"
        : /metric|measure|distance|index/i.test(type)
          ? "metric"
          : /method|software|tool|test|classifier|analysis|approach/i.test(type)
            ? "method"
            : "other";
export function mergeGroundedConcepts(
  concepts: Concept[],
  doc: ResearchDocument,
): Concept[] {
  const merged: Concept[] = [];
  for (const candidate of concepts) {
    const comparator = (term: string) =>
      /^(?:controls?|control group|healthy(?: controls?| individuals)?|patients?|case group|study group)$/i.test(
        term.trim(),
      );
    const aliases = comparator(candidate.label)
      ? candidate.aliases
      : candidate.aliases.filter(
          (a) =>
            !comparator(a) &&
            !/^(?:genes?|pathways?|microbes?|methods?|findings|significant)$/i.test(
              a.trim(),
            ),
        );
    const terms = [candidate.label, ...aliases].filter((t) =>
      doc.passages.some(
        (p) =>
          !/^(?:\d+[.)]?\s*)?references$/i.test(p.section.trim()) &&
          occurrences(p.text, t).length,
      ),
    );
    if (!terms.length) continue;
    const keys = terms.map(normalizeLabel);
    const canonical = terms.map((t) => entityKey(t, candidate.type));
    const identifiers = [
      ...new Set(
        terms
          .flatMap((t) => t.match(/\bK\d{5}\b/gi) || [])
          .map((t) => t.toUpperCase()),
      ),
    ];
    const old = merged.find(
      (c) =>
        [c.label, ...c.aliases].some((t) => keys.includes(normalizeLabel(t))) ||
        (entityFamily(c.type) === entityFamily(candidate.type) &&
          [c.label, ...c.aliases].some((t) =>
            canonical.includes(entityKey(t, c.type)),
          )) ||
        (identifiers.length === 1 &&
          [
            ...new Set(
              [c.label, ...c.aliases]
                .flatMap((t) => t.match(/\bK\d{5}\b/gi) || [])
                .map((t) => t.toUpperCase()),
            ),
          ].join() === identifiers[0]),
    );
    if (old) {
      old.aliases = [
        ...new Set(
          [...old.aliases, ...terms, ...identifiers].filter(
            (t) => normalizeLabel(t) !== normalizeLabel(old.label),
          ),
        ),
      ].slice(0, 8);
      if (old.type === "Concept") old.type = candidate.type;
    } else
      merged.push({
        ...candidate,
        aliases: [...new Set([...terms, ...identifiers])].filter(
          (t) => normalizeLabel(t) !== normalizeLabel(candidate.label),
        ),
        selected: true,
      });
  }
  return merged;
}
export interface DiscoveryProgress {
  completed: number[];
  concepts: Concept[];
}
export async function discoverCoverage(
  provider: LLMProvider,
  doc: ResearchDocument,
  seeds: Concept[],
  options: ExtractionOptions,
  focus: string,
  signal: AbortSignal,
  before: (stage: string) => Promise<void>,
  checkpoint: (
    concepts: Concept[],
    progress: DiscoveryProgress,
  ) => Promise<void>,
  resume?: DiscoveryProgress,
) {
  const batches = coverageBatches(doc, options.contextTokens);
  let inventory = mergeGroundedConcepts(resume?.concepts || seeds, doc);
  const completed = new Set(resume?.completed || []);
  for (const [i, batch] of batches.entries()) {
    if (completed.has(i)) continue;
    await before(`Reviewing paper: ${i + 1} of ${batches.length} sections…`);
    const discovered = await discover(
      provider,
      batch,
      inventory.filter(
        (c) =>
          c.type !== "Concept" &&
          batch.some((p) =>
            [c.label, ...c.aliases].some((t) => occurrences(p.text, t).length),
          ),
      ),
      { ...options, maxNodes: 12 },
      signal,
      focus,
    );
    inventory = mergeGroundedConcepts([...inventory, ...discovered], doc);
    completed.add(i);
    await checkpoint(inventory, {
      completed: [...completed],
      concepts: inventory,
    });
  }
  return {
    concepts: inventory.slice(0, options.maxNodes),
    omitted: inventory.slice(options.maxNodes).map((c) => c.label),
    batches: batches.length,
    discovered: inventory.length,
  };
}
const relationSchema = {
  ...graphSchema,
  properties: { edges: graphSchema.properties.edges },
  required: ["edges"],
};
export interface ExtractionProgress {
  completed: number[];
  edges: KnowledgeGraph["edges"];
  rejected: number;
}
export async function extractCoverage(
  provider: LLMProvider,
  doc: ResearchDocument,
  concepts: Concept[],
  options: ExtractionOptions,
  signal: AbortSignal,
  before: (stage: string) => Promise<void>,
  checkpoint?: (progress: ExtractionProgress) => Promise<void>,
  resume?: ExtractionProgress,
) {
  const nodes: GraphNode[] = concepts
    .filter((c) => c.selected)
    .map((c, i) => ({
      id: `n${i + 1}`,
      label: c.label,
      type: c.type,
      aliases: c.aliases,
    }));
  const batches = coverageBatches(doc, options.contextTokens),
    edges: KnowledgeGraph["edges"] = [...(resume?.edges || [])],
    warnings: string[] = [],
    seen = new Set(
      edges.map(
        (e) => `${e.source}|${e.target}|${e.relationship}|${e.paperId || ""}`,
      ),
    );
  const completed = new Set(resume?.completed || []);
  let calls = completed.size,
    rejected = resume?.rejected || 0;
  const sent: Passage[] = [];
  for (const [i, batch] of batches.entries()) {
    const relevant = nodes.filter((n) =>
      batch.some((p) =>
        [n.label, ...n.aliases].some((t) => occurrences(p.text, t).length),
      ),
    );
    if (relevant.length < 2) continue;
    if (completed.has(i)) {
      sent.push(...batch);
      continue;
    }
    await before(
      `Checking relationships: section ${i + 1} of ${batches.length}…`,
    );
    const raw = await provider.structured(
      `Extract up to 12 distinct evidence-backed relationships among supplied concept IDs. Use only these IDs. Check every named finding/list item and method in the excerpt, including gene identifiers, organisms and pathways. Only when the source is a studied condition and the target is an explicitly reported significant feature use condition -> feature with has_reported_feature; never call a condition a biomarker of a feature. Reported features are not validated diagnostic tests. Do not convert them into causes or cures. For each relationship cite the exact passageId and a contiguous verbatim quote of 15–240 characters. The quote and surrounding excerpt must support BOTH endpoints and the predicate, not merely contain a related word. Do not infer direction of change, causation, or certainty from a correlation. Preserve may/could/possible qualifiers; never turn a proposed mechanism into an unconditional cause. A uses_metric target must be a metric/distance, not a sample, organism or biological system. Check the supplied concept types before choosing predicates. A method identifies features; it is not identified as a feature. Normalization acts on data, not another analysis method. Do not attribute feature-importance calculations or plots to the best-performing classifier unless the text explicitly assigns that operation to it. Co-mention alone is insufficient. For all other pairs use their precise biochemical or methodological relationship, never has_reported_feature. Do not substitute a gene for the function of its encoded protein. Never treat bibliography titles, OCR garbling, or unrelated neighboring columns as findings. ${options.includeInferred ? "Label speculative relationships inferred and explain their uncertainty." : "Exclude speculative/inferred relationships."} Use stated for explicit support, implied only for clear contextual support. Keep explanations to one short sentence. Confidence is an uncalibrated estimate. Return empty edges if unsupported.`,
      JSON.stringify({
        concepts: relevant.map(({ id, label, type, aliases }) => ({
          id,
          label,
          type,
          aliases: aliases.filter((t) =>
            batch.some((p) => occurrences(p.text, t).length),
          ),
        })),
      }) +
        "\n" +
        formatContext(batch),
      relationSchema,
      signal,
    );
    calls++;
    sent.push(...batch);
    let candidates: unknown =
      raw && typeof raw === "object" && "edges" in raw ? raw.edges : null;
    // Compatible JSON-mode models may include redundant nodes. Canonicalize only
    // IDs whose labels match our grounded inventory; never admit new concepts.
    if (
      raw &&
      typeof raw === "object" &&
      "nodes" in raw &&
      Array.isArray(raw.nodes) &&
      Array.isArray(candidates)
    ) {
      const ids = new Map(
        raw.nodes.flatMap((n) => {
          if (!n || typeof n.label !== "string" || typeof n.id !== "string")
            return [];
          const match = nodes.find((c) =>
            [c.label, ...c.aliases].some(
              (t) => normalizeLabel(t) === normalizeLabel(n.label),
            ),
          );
          return match ? [[n.id, match.id] as const] : [];
        }),
      );
      candidates = candidates.map((e) =>
        e && typeof e === "object"
          ? {
              ...e,
              source: ids.get(e.source) || e.source,
              target: ids.get(e.target) || e.target,
            }
          : e,
      );
    }
    if (Array.isArray(candidates))
      candidates = candidates.map((e) =>
        e && typeof e === "object" ? { ...e, edited: undefined } : e,
      );
    const result = validateGraph(
      { nodes, edges: candidates },
      batch,
      {
        ...options,
        maxEdges: 12,
      },
      true,
    );
    // Quote existence is mandatory; semantic accuracy remains reviewable by users.
    rejected += result.warnings.reduce(
      (sum, w) =>
        sum + (/^\d+ duplicate/.test(w) ? Number(w.split(" ")[0]) : 0),
      0,
    );
    for (const edge of result.graph.edges) {
      const key = `${edge.source}|${edge.target}|${edge.relationship}|${edge.paperId || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ ...edge, id: `e${edges.length + 1}` });
      }
    }
    completed.add(i);
    await checkpoint?.({
      completed: [...completed],
      edges: [...edges],
      rejected,
    });
  }
  if (rejected)
    warnings.push(
      `${rejected} unsupported or invalid relationship candidates were removed.`,
    );
  if (edges.length > options.maxEdges)
    warnings.push(
      `${edges.length - options.maxEdges} validated relationships exceed the graph limit. Increase Maximum relationships to retain them.`,
    );
  const retained = edges.slice(0, options.maxEdges),
    connected = new Set(retained.flatMap((e) => [e.source, e.target]));
  const isolated = nodes.filter((n) => !connected.has(n.id)).length;
  if (isolated)
    warnings.push(
      `${isolated} grounded concepts are retained with source references but have no validated relationships.`,
    );
  warnings.push(
    `All ${doc.passages.length} parsed passages were traversed locally; identified bibliography sections were excluded from AI discovery; ${calls} relationship requests reviewed sections containing at least two selected concepts. OCR and model omissions still require review.`,
  );
  return { graph: { nodes, edges: retained }, warnings, passages: sent, calls };
}
export function evidenceAudit(graph: KnowledgeGraph, sources: Passage[]) {
  return (
    graph.edges.every((e) =>
      sources.some(
        (p) =>
          p.id === e.passageId &&
          quoteKey(p.text).includes(quoteKey(e.evidence)),
      ),
    ) && graph.nodes.every((n) => n.sources?.length)
  );
}
