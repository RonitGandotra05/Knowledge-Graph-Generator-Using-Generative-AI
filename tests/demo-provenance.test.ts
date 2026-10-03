import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { demoAnalysis } from "../src/ui/demo";
import { quoteKey } from "../src/documents/text";
import { jsonExport, importAnalysis } from "../src/graph/export";

describe("sample paper provenance", () => {
  it("identifies the bundled PDF by its actual bytes", () => {
    const bytes = readFileSync(
      new URL("../public/samples/NEJMoa2035389.pdf", import.meta.url),
    );
    expect(demoAnalysis().papers![0].fingerprint).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });
  it("opens a fresh editable copy without changing the saved sample", () => {
    const first = demoAnalysis();
    first.graph.nodes.splice(0);
    first.settings.positions = { personal: { x: 1, y: 2 } };
    expect(demoAnalysis().graph.nodes).toHaveLength(18);
    expect(demoAnalysis().settings.positions).toBeUndefined();
  });
  it("saves real source passages for every concept and connection, including offline exports", () => {
    for (const analysis of [
      demoAnalysis(),
      importAnalysis(jsonExport(demoAnalysis())),
    ]) {
      expect(analysis.papers?.[0].citation).toContain(
        "N Engl J Med. 2021;384:403–416",
      );
      expect(analysis.papers?.[0].doi).toBe("10.1056/NEJMoa2035389");
      expect(analysis.graph.nodes).toHaveLength(18);
      expect(analysis.concepts.map((c) => c.label)).toEqual(
        analysis.graph.nodes.map((n) => n.label),
      );
      expect(analysis.graph.edges).toHaveLength(19);
      const connected = new Set(
        analysis.graph.edges.flatMap((e) => [e.source, e.target]),
      );
      expect(
        analysis.graph.nodes.every(
          (n) => n.label.trim() && connected.has(n.id),
        ),
      ).toBe(true);
      for (const edge of analysis.graph.edges) {
        const source = analysis.sources?.find((p) => p.id === edge.passageId);
        expect(source, edge.id).toBeDefined();
        expect(quoteKey(source!.text)).toContain(quoteKey(edge.evidence));
        expect(edge.paperName).toBe("NEJMoa2035389.pdf");
        expect(edge.page).toBe(source!.page);
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
