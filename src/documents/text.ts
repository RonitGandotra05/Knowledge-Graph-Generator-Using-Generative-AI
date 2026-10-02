import type { Passage, ResearchDocument } from "../types";
export const normalizeText = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/([\p{L}])-\s*\n\s*([\p{Ll}])/gu, "$1$2")
    .replace(/([A-Z0-9])-\s*\n\s*([A-Z])/g, "$1-$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .trim();
export const quoteKey = (text: string) =>
  normalizeText(text).replace(/\s+/g, " ").toLocaleLowerCase();
export function sectionHeading(line: string): string | null {
  const value = line.trim();
  if (!value || value.length > 120 || /\.{3,}/.test(value)) return null;
  const canonical =
    /^(?:(?:\d+(?:\.\d+)*[.)]?|[IVXLCDM]+[.)])\s+)?(?:abstract|introduction|background|methods|methodology|materials and methods|results|discussion|conclusion[s]?|references)\s*$/i;
  if (canonical.test(value)) return value;
  // Section names are hints. Prefer missing an unusual heading to assigning an
  // affiliation, reference, date, unit, or table-of-contents entry to later text.
  const numbered =
    /^([1-9]\d?(?:\.\d+)*\.?|[IVXLCDM]+\.)\s+([\p{Lu}][\p{L}\p{N} \t()/'’–—-]+)$/u.exec(
      value,
    );
  if (!numbered || (/^\d/.test(numbered[1]) && parseInt(numbered[1]) > 30))
    return null;
  const title = numbered[2],
    words = title.split(/\s+/);
  return words.length >= 2 && words.length <= 12 && !/\d\s*$/.test(title)
    ? value
    : null;
}
export function documentFromPages(
  name: string,
  pages: string[],
  paginated = true,
): ResearchDocument {
  const passages: Passage[] = [];
  let section = "Document";
  for (const [pageIndex, raw] of pages.entries()) {
    const text = normalizeText(raw);
    // Bound paragraph size even for PDFs with no paragraph markers; never collapse the whole paper into one passage.
    const append = (block: string) => {
      const chunks =
        block.match(/[\s\S]{1,1100}(?:[.!?](?=\s)|$)|[\s\S]{1,1100}/g) || [];
      for (const chunk of chunks)
        if (chunk.trim())
          passages.push({
            id: `p${pageIndex + 1}-${passages.length + 1}`,
            text: chunk.trim(),
            page: paginated ? pageIndex + 1 : null,
            section,
            paragraph: passages.length + 1,
            terms: [],
          });
    };
    for (const block of text.split(/\n\s*\n/)) {
      let buffer: string[] = [];
      for (const line of block.split("\n")) {
        const heading = sectionHeading(line);
        if (heading) {
          append(buffer.join("\n"));
          buffer = [];
          section = heading;
        }
        buffer.push(line);
      }
      append(buffer.join("\n"));
    }
  }
  const characters = passages.reduce((sum, p) => sum + p.text.length, 0);
  if (!characters || !passages.some((p) => /[\p{L}]{3}/u.test(p.text)))
    throw new Error(
      "No readable text found. Scanned PDFs need OCR before upload.",
    );
  return {
    name,
    pages: paginated ? pages.length : 0,
    characters,
    passages,
    warnings: paginated
      ? [
          "Page numbers are PDF page indices. Complex columns, tables, and equations may need review.",
        ]
      : [
          "DOCX and text files use paragraph references; page numbers are unavailable.",
        ],
  };
}
