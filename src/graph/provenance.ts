import type { KnowledgeGraph, Passage, ResearchDocument } from "../types";
import { occurrences } from "../retrieval/context";
import { quoteKey } from "../documents/text";
export function attachProvenance(
  graph: KnowledgeGraph,
  doc: ResearchDocument,
  selected: Passage[],
): Passage[] {
  const used = new Map<string, Passage>();
  for (const edge of graph.edges) {
    const window = selected.find((p) => p.id === edge.passageId);
    const original = doc.passages.find(
      (p) =>
        p.paperId === window?.paperId &&
        p.paragraph === window?.paragraph &&
        p.page === window?.page,
    );
    const source =
      original && quoteKey(original.text).includes(quoteKey(edge.evidence))
        ? original
        : window;
    if (source) {
      used.set(source.id, source);
      edge.passageId = source.id;
      edge.paragraph = source.paragraph;
      edge.page = source.page;
      edge.section = source.section;
      edge.paperId = source.paperId;
      edge.paperName = source.paperName;
    }
  }
  for (const node of graph.nodes) {
    node.sources = [];
    const perPaper = new Map<string, number>();
    for (const passage of doc.passages) {
      const scope = passage.paperId || "single";
      if ((perPaper.get(scope) || 0) >= 5) continue;
      const match = [node.label, ...node.aliases].flatMap((t) =>
        occurrences(passage.text, t),
      )[0];
      if (!match) continue;
      used.set(passage.id, passage);
      node.sources.push({
        passageId: passage.id,
        paperId: passage.paperId,
        paperName: passage.paperName,
        paragraph: passage.paragraph,
        page: passage.page,
        section: passage.section,
        quote: passage.text.slice(
          Math.max(0, match[0] - 80),
          Math.min(passage.text.length, match[1] + 120),
        ),
      });
      perPaper.set(scope, (perPaper.get(scope) || 0) + 1);
    }
  }
  return [...used.values()].map((p) => ({ ...p, terms: [] }));
}
// Match whitespace/case variations while highlighting the actual source characters.
export function quoteRange(
  text: string,
  quote: string,
): [number, number] | null {
  if (!quote.trim()) return null;
  const pattern = quote
    .normalize("NFKC")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern, "iu").exec(text.normalize("NFKC"));
  return match ? [match.index, match.index + match[0].length] : null;
}
