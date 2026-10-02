import type { PaperRecord } from "../types";
export function safePapers(papers: PaperRecord[]): PaperRecord[] {
  if (!Array.isArray(papers)) return [];
  const num = (n: unknown) =>
    Number.isInteger(n) && Number(n) >= 0 ? Number(n) : 0;
  const pages = (p: unknown) =>
    Array.isArray(p) ? p.filter((n) => num(n) > 0).slice(0, 500) : [];
  return papers
    .slice(0, 10)
    .filter((p) => p && typeof p.name === "string" && typeof p.id === "string")
    .map((p) => ({
      id: p.id.slice(0, 100),
      name: p.name.slice(0, 500),
      status:
        p.status === "ready"
          ? "ready"
          : p.status === "partial"
            ? "partial"
            : "failed",
      pages: num(p.pages),
      characters: num(p.characters),
      ocrPages: pages(p.ocrPages),
      skippedPages: pages(p.skippedPages),
      error: typeof p.error === "string" ? p.error.slice(0, 1000) : undefined,
    }));
}
