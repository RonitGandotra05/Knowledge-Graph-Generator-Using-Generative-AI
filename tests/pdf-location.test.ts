import { describe, it, expect } from "vitest";
import { locatePDFQuote, safePDFLines } from "../src/documents/pdf-location";
import { demoAnalysis } from "../src/ui/demo";
import { jsonExport, importAnalysis } from "../src/graph/export";
const line = (text: string, y: number) => ({
  text,
  x: 0.1,
  y,
  width: 0.8,
  height: 0.02,
});

describe("PDF quote highlighting", () => {
  it("locates only supporting lines across case, wrapping, ligatures and hyphenation", () => {
    const lines = [
      line("Unrelated heading", 0.1),
      line("A neurodevel-", 0.2),
      line("opmental effect uses TC.FEV.OM and ABCB-", 0.23),
      line("BAC gene features in a ﬁnding.", 0.26),
      line("Other text", 0.3),
    ];
    expect(
      locatePDFQuote(
        lines,
        "neurodevelopmental effect uses TC.FEV.OM and ABCB-BAC gene features in a finding.",
      ),
    ).toEqual(lines.slice(1, 4));
    expect(locatePDFQuote(lines, "Invented research quotation")).toEqual([]);
    expect(locatePDFQuote(lines, " ")).toEqual([]);
  });
  it("rejects unsafe imported rectangles and strips unrelated fields", () => {
    expect(
      safePDFLines([
        { ...line("Proof", 0.2), key: "PRIVATE" },
        { ...line("No", 0.3), x: -1 },
        { ...line("No", 0.3), height: Infinity },
      ]),
    ).toEqual([line("Proof", 0.2)]);
  });
  it("preserves sample coordinates and paper identity through JSON round trips", () => {
    for (const analysis of [
      demoAnalysis(),
      importAnalysis(jsonExport(demoAnalysis())),
    ]) {
      expect(analysis.papers![0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
      for (const edge of analysis.graph.edges) {
        const source = analysis.sources!.find((p) => p.id === edge.passageId)!;
        expect(
          locatePDFQuote(source.pdfLines!, edge.evidence).length,
          edge.id,
        ).toBeGreaterThan(0);
      }
    }
  });
});
