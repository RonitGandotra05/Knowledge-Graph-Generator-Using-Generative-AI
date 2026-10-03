import type { PDFLine } from "../types";
import { quoteKey } from "./text";

// Keep a line index for every normalized character so a contiguous quote can
// highlight the actual printed lines, including wrapped and hyphenated text.
export function locatePDFQuote(lines: PDFLine[], quote: string): PDFLine[] {
  let text = "";
  const indices: number[] = [];
  const append = (value: string, index: number) => {
    for (const char of value) {
      if (/\s/u.test(char)) {
        if (!text || text.endsWith(" ")) continue;
        text += " ";
        indices.push(index);
      } else {
        const lower = char.toLocaleLowerCase();
        text += lower;
        for (let i = 0; i < lower.length; i++) indices.push(index);
      }
    }
  };
  for (const [index, line] of lines.entries()) {
    let value = line.text
      .normalize("NFKC")
      .replace(/\u00ad/g, "")
      .trim();
    const next = lines[index + 1]?.text.trim() || "";
    const lowerWrap = /[\p{L}]-$/u.test(value) && /^\p{Ll}/u.test(next);
    const upperWrap = /[A-Z0-9]-$/.test(value) && /^[A-Z]/.test(next);
    if (lowerWrap) value = value.slice(0, -1);
    append(value, index);
    if (!lowerWrap && !upperWrap) append(" ", index);
  }
  const key = quoteKey(quote);
  if (!key) return [];
  const start = text.indexOf(key);
  if (start < 0) return [];
  return [...new Set(indices.slice(start, start + key.length))].map(
    (i) => lines[i],
  );
}

export function safePDFLines(value: unknown): PDFLine[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 200).flatMap((line) => {
    if (!line || typeof line.text !== "string") return [];
    const { x, y, width, height } = line;
    if (
      ![x, y, width, height].every(
        (n) => typeof n === "number" && Number.isFinite(n),
      ) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 1.01 ||
      y + height > 1.01
    )
      return [];
    return [{ text: line.text.slice(0, 2000), x, y, width, height }];
  });
}
