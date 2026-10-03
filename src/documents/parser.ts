import { documentFromPages } from "./text";
import type { ResearchDocument, PDFLine } from "../types";
import { locatePDFQuote } from "./pdf-location";
const maxBytes = 30 * 1024 * 1024;
export async function parseDocument(
  file: File,
  progress: (message: string) => void = () => {},
  useOCR = true,
): Promise<ResearchDocument> {
  if (file.size > maxBytes)
    throw new Error(
      "This file exceeds the 30 MB limit. Use a smaller document.",
    );
  if (!file.size) throw new Error("The file is empty.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  progress("Parsing document locally…");
  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    const { default: worker } =
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
      throw new Error("This is not a valid PDF file.");
    const task = pdfjs.getDocument({ data: bytes });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 500)
        throw new Error(
          "This PDF exceeds the 500 page limit. Split it into smaller documents.",
        );
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        progress(`Parsing page ${i} of ${pdf.numPages} locally…`);
        try {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          let lastY: number | undefined;
          let text = "";
          for (const item of content.items) {
            if (!("str" in item)) continue;
            const y = item.transform[5];
            if (
              lastY !== undefined &&
              Math.abs(lastY - y) > Math.max(20, item.height * 1.7)
            )
              text += "\n\n";
            text += item.str + (item.hasEOL ? "\n" : " ");
            lastY = y;
          }
          pages[i - 1] = text;
          page.cleanup();
        } catch {
          pages[i - 1] = "";
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const sparsePages = pages.flatMap((p, i) =>
        p.trim().length < 30 ? [i + 1] : [],
      );
      const skippedPages: number[] = [];
      const ocrPages: number[] = [];
      const pageLines = new Map<number, PDFLine[]>();
      let ocrFailure = "";
      if (sparsePages.length && useOCR) {
        try {
          const { ocrPDF } = await import("./ocr");
          await ocrPDF(
            pdf,
            progress,
            sparsePages,
            (pageNumber, text, lines) => {
              if (
                text &&
                /[\p{L}]{3}/u.test(text) &&
                text.trim().length >= 30
              ) {
                pages[pageNumber - 1] = text;
                ocrPages.push(pageNumber);
                if (lines) pageLines.set(pageNumber, lines);
              } else skippedPages.push(pageNumber);
            },
          );
        } catch (error) {
          ocrFailure =
            error instanceof Error
              ? error.message
              : "OCR could not recover text.";
          skippedPages.push(
            ...sparsePages.filter(
              (p) => !ocrPages.includes(p) && !skippedPages.includes(p),
            ),
          );
        }
      } else skippedPages.push(...sparsePages);
      for (const page of skippedPages) pages[page - 1] = "";
      if (!pages.some((p) => /[\p{L}]{3}/u.test(p) && p.trim().length >= 30))
        throw new Error(
          ocrFailure ||
            (useOCR
              ? "No readable text recovered, including automatic OCR. This paper is excluded."
              : "This PDF has no extractable text."),
        );
      const result = documentFromPages(file.name, pages);
      for (const passage of result.passages) {
        const lines = pageLines.get(passage.page!);
        if (lines) passage.pdfLines = locatePDFQuote(lines, passage.text);
      }
      result.ocrPages = ocrPages;
      result.skippedPages = [...new Set(skippedPages)].sort((a, b) => a - b);
      if (ocrPages.length)
        result.warnings.push(
          `OCR was applied to ${ocrPages.length} page(s) with little extractable text. Review quotes carefully: genes, symbols, tables, and column order may be misread.`,
        );
      if (result.skippedPages.length)
        result.warnings.push(
          `PDF page(s) ${result.skippedPages.join(", ")} have little extractable text and were excluded${ocrFailure ? ": " + ocrFailure : useOCR ? " after automatic OCR (blank or unreadable)." : "."}`,
        );
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "PasswordException")
        throw new Error(
          "Password-protected PDFs are unsupported. Upload an unlocked copy.",
        );
      throw error;
    } finally {
      await task.destroy();
    }
  }
  if (extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({
      arrayBuffer: await file.arrayBuffer(),
    });
    return documentFromPages(file.name, [result.value], false);
  }
  if (["txt", "md", "csv", "tsv"].includes(extension || "")) {
    const buffer = await file.arrayBuffer();
    if (new Uint8Array(buffer).slice(0, 8000).includes(0))
      throw new Error("The file looks binary. Upload UTF-8 plain text.");
    return documentFromPages(
      file.name,
      [new TextDecoder("utf-8", { fatal: true }).decode(buffer)],
      false,
    );
  }
  throw new Error(
    "Unsupported format. Choose PDF, DOCX, TXT, Markdown, CSV, or TSV.",
  );
}
