import type { Concept, Passage, ResearchDocument } from "../types";
import { quoteKey } from "../documents/text";
export const normalizeLabel = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
export function parseTerms(text: string): Concept[] {
  return [
    ...new Map(
      text
        .split(/[,;\n]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((label) => [
          normalizeLabel(label),
          { label, type: "Concept", aliases: [], selected: true },
        ]),
    ).values(),
  ];
}
export function occurrences(
  text: string,
  term: string,
): Array<[number, number]> {
  const needle = term.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!needle) return [];
  const escaped = needle
    .split(" ")
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+(?:\\(([A-Za-z0-9.-]{2,16})\\)\\s+)?");
  const regex = new RegExp(escaped, "giu");
  const result: Array<[number, number]> = [];
  for (const match of text.matchAll(regex)) {
    // Permit an explicitly inserted uppercase acronym, retaining original
    // offsets for source quotations. Do not skip ordinary parenthetical prose.
    if (
      match
        .slice(1)
        .some((acronym) => acronym && !/^[A-Z][A-Z0-9.-]+$/.test(acronym))
    )
      continue;
    const start = match.index!;
    const end = start + match[0].length;
    if (
      /^[\p{L}\p{N}]/u.test(needle) &&
      start > 0 &&
      /[\p{L}\p{N}_]/u.test(text[start - 1])
    )
      continue;
    if (
      /[\p{L}\p{N}]$/u.test(needle) &&
      end < text.length &&
      /[\p{L}\p{N}_]/u.test(text[end])
    )
      continue;
    result.push([start, end]);
  }
  return result;
}
export function mergeWindows(
  windows: Array<[number, number]>,
): Array<[number, number]> {
  const merged: Array<[number, number]> = [];
  for (const [start, end] of [...windows].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
export interface ContextSelection {
  passages: Passage[];
  matches: Record<string, number>;
  matchedPassages: number;
  characters: number;
  estimatedTokens: number;
  missing: string[];
  totalOccurrences: number;
}
// Keep the conservative allowance, but account for unusually long provenance
// headers so the serialized context also fits the advertised character budget.
const passageCost = (p: Passage) =>
  Math.max(p.text.length + 160, formatContext([p]).length + 2);
export function selectContext(
  doc: ResearchDocument,
  concepts: Concept[],
  tokenBudget: number,
): ContextSelection {
  const selected = concepts.filter((c) => c.selected);
  const matches: Record<string, number> = Object.fromEntries(
    selected.map((c) => [c.label, 0]),
  );
  const candidates: Array<Passage & { score: number }> = [];
  for (const p of doc.passages) {
    const windows: Array<[number, number]> = [];
    for (const c of selected) {
      const found = mergeWindows(
        [c.label, ...c.aliases].flatMap((term) => occurrences(p.text, term)),
      );
      matches[c.label] += found.length;
      windows.push(
        ...found.map(
          ([start, end]) =>
            [Math.max(0, start - 260), Math.min(p.text.length, end + 340)] as [
              number,
              number,
            ],
        ),
      );
    }
    for (const [i, [start, end]] of mergeWindows(windows).entries()) {
      // Expand to word boundaries to keep quotations intact.
      let a = start,
        b = end;
      while (a > 0 && !/\s/.test(p.text[a - 1])) a--;
      while (b < p.text.length && !/\s/.test(p.text[b])) b++;
      const text = p.text.slice(a, b).trim();
      const windowMatches = selected.map((c) => ({
        concept: c,
        found: mergeWindows(
          [c.label, ...c.aliases].flatMap((term) => occurrences(text, term)),
        ),
      }));
      const terms = windowMatches
        .filter((m) => m.found.length)
        .map((m) => m.concept.label);
      const hits = windowMatches.reduce((sum, m) => sum + m.found.length, 0);
      candidates.push({
        ...p,
        id: `${p.id}-w${i}`,
        text,
        terms,
        score:
          terms.length * 10 +
          Math.min(hits, 8) +
          (/abstract|results|conclusion/i.test(p.section) ? 2 : 0),
      });
    }
  }
  const passages: Passage[] = [],
    seen = new Set<string>();
  let characters = 0;
  const maxChars = Math.max(500, tokenBudget * 4);
  // First choose passages covering otherwise unrepresented concepts, then highest relevance.
  const covered = new Set<string>();
  const matchedPassages = candidates.length;
  const remaining = candidates.sort(
    (a, b) => b.score - a.score || a.paragraph - b.paragraph,
  );
  while (remaining.length) {
    let index = remaining.findIndex(
      (p) =>
        p.terms.some((t) => !covered.has(t)) &&
        characters + passageCost(p) <= maxChars,
    );
    if (index < 0) index = 0;
    const p = remaining.splice(index, 1)[0],
      key = quoteKey(p.text);
    if (seen.has(key) || characters + passageCost(p) > maxChars) continue;
    seen.add(key);
    p.terms.forEach((t) => covered.add(t));
    const { score: _, ...passage } = p;
    passages.push(passage);
    characters += passageCost(p);
  }
  return {
    passages,
    matches,
    matchedPassages,
    characters,
    estimatedTokens: Math.ceil(characters / 4),
    missing: selected.filter((c) => !matches[c.label]).map((c) => c.label),
    totalOccurrences: Object.values(matches).reduce((a, b) => a + b, 0),
  };
}
export function discoveryContext(
  doc: ResearchDocument,
  tokenBudget: number,
): Passage[] {
  const budget = tokenBudget * 4;
  const preferred = doc.passages.filter((p) =>
    /abstract|introduction|results|conclusion/i.test(p.section),
  );
  const spread = Array.from(
    { length: Math.min(doc.passages.length, 24) },
    (_, i) =>
      doc.passages[
        Math.floor(
          (i * (doc.passages.length - 1)) /
            Math.max(1, Math.min(doc.passages.length, 24) - 1),
        )
      ],
  );
  const ordered = [
    ...doc.passages.slice(0, 3),
    ...preferred.slice(0, 6),
    ...spread,
  ];
  const selected: Passage[] = [],
    seen = new Set<string>();
  let size = 0;
  for (const p of ordered) {
    const key = quoteKey(p.text);
    if (seen.has(key) || size + passageCost(p) > budget) continue;
    seen.add(key);
    selected.push(p);
    size += passageCost(p);
  }
  return selected;
}
export const formatContext = (passages: Passage[]) =>
  passages
    .map(
      (p) =>
        `[${p.id}] Page: ${p.page ?? "unavailable"}; Section: ${p.section}${p.paperName ? "; Paper: " + JSON.stringify(p.paperName) : ""}; Paragraph: ${p.paragraph}\n${p.text}`,
    )
    .join("\n\n");
