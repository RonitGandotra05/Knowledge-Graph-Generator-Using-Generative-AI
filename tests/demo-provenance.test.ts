import { describe, it, expect } from "vitest";
import { demoAnalysis } from "../src/ui/demo";
import { quoteKey } from "../src/documents/text";
import { jsonExport, importAnalysis } from "../src/graph/export";

describe("sample paper provenance", () => {
  it("saves real source passages for every concept and connection, including offline exports", () => {
    for (const analysis of [
      demoAnalysis(),
      importAnalysis(jsonExport(demoAnalysis())),
    ]) {
      expect(analysis.papers?.[0].citation).toContain(
        "Biomedicine. 2024;44(2):190–203",
      );
      expect(analysis.papers?.[0].doi).toBe("10.51248/v44i2.01");
      for (const edge of analysis.graph.edges) {
        const source = analysis.sources?.find((p) => p.id === edge.passageId);
        expect(source, edge.id).toBeDefined();
        expect(quoteKey(source!.text)).toContain(quoteKey(edge.evidence));
        expect(edge.paperName).toBe("05v1.pdf");
        expect(edge.page).toBe(1);
        expect(edge.paragraph).toBe(source!.paragraph);
      }
      for (const node of analysis.graph.nodes) {
        expect(node.sources?.length, node.label).toBeGreaterThan(0);
        for (const ref of node.sources!) {
          const source = analysis.sources!.find((p) => p.id === ref.passageId)!;
          expect(quoteKey(source.text)).toContain(quoteKey(ref.quote));
          expect(ref.paperId).toBe(source.paperId);
        }
      }
    }
  });
});
