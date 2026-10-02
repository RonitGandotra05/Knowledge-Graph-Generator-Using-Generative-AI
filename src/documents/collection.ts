import { parseDocument } from "./parser";
import type { PaperRecord, ResearchDocument } from "../types";
export const maxPapers = 10;
export function combineDocuments(
  entries: { paper: PaperRecord; document: ResearchDocument | null }[],
): ResearchDocument | null {
  const usable = entries.filter((e) => e.document);
  if (!usable.length) return null;
  return {
    name:
      usable.length === 1
        ? usable[0].paper.name
        : `${usable.length} research papers`,
    pages: usable.reduce((n, e) => n + e.document!.pages, 0),
    characters: usable.reduce((n, e) => n + e.document!.characters, 0),
    passages: usable.flatMap(({ paper, document }) =>
      document!.passages.map((p) => ({
        ...p,
        id: `${paper.id}:${p.id}`,
        paperId: paper.id,
        paperName: paper.name,
      })),
    ),
    papers: entries.map((e) => e.paper),
    warnings: entries.flatMap(({ paper, document }) =>
      document
        ? document.warnings.map((w) => `${paper.name}: ${w}`)
        : [`${paper.name} excluded: ${paper.error}`],
    ),
  };
}
export async function parseCollection(
  files: File[],
  progress: (message: string) => void,
  checkpoint: (
    entries: { paper: PaperRecord; document: ResearchDocument | null }[],
  ) => void = () => {},
) {
  if (!files.length || files.length > maxPapers)
    throw Error(
      `Choose between 1 and ${maxPapers} files. Your previous work is kept.`,
    );
  const entries: { paper: PaperRecord; document: ResearchDocument | null }[] =
    [];
  for (const [index, file] of files.entries()) {
    const paper: PaperRecord = {
      id: `paper-${index + 1}`,
      name: file.name,
      status: "failed",
      pages: 0,
      characters: 0,
      ocrPages: [],
      skippedPages: [],
    };
    let document: ResearchDocument | null = null;
    try {
      document = await parseDocument(file, (message) =>
        progress(
          `Paper ${index + 1}/${files.length} · ${file.name}: ${message}`,
        ),
      );
      Object.assign(paper, {
        status: document.skippedPages?.length ? "partial" : "ready",
        pages: document.pages,
        characters: document.characters,
        ocrPages: document.ocrPages || [],
        skippedPages: document.skippedPages || [],
      });
    } catch (error) {
      paper.error =
        error instanceof Error ? error.message : "This file could not be read.";
    }
    entries.push({ paper, document });
    checkpoint(entries);
  }
  return {
    document: combineDocuments(entries),
    papers: entries.map((e) => e.paper),
  };
}
