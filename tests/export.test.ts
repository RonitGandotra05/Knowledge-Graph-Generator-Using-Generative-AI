import { describe, expect, it } from "vitest";
import { importAnalysis, jsonExport } from "../src/graph/export";
import { demoAnalysis } from "../src/ui/demo";
describe("portable analyses", () => {
  it("allows only analysis fields and strips unrelated secrets", () => {
    const a = demoAnalysis();
    const contaminated = {
      ...a,
      key: "NEVER-EXPORT",
      stats: { ...a.stats, key: "ALSO-PRIVATE" },
      graph: { ...a.graph, key: "PRIVATE" },
    };
    const output = jsonExport(contaminated);
    expect(output).not.toContain("NEVER-EXPORT");
    expect(output).not.toContain("ALSO-PRIVATE");
    expect(output).not.toContain("PRIVATE");
  });
  it("preserves long verified quotes and settings on reimport", () => {
    const a = demoAnalysis();
    a.graph.edges[0].evidence =
      "Long source excerpt with research evidence. ".repeat(20);
    a.settings.layout = "circle";
    a.settings.nodeShape = "circle";
    a.settings.physics = false;
    a.settings.positions = { asd: { x: 120, y: 200 } };
    const restored = importAnalysis(jsonExport(a));
    expect(restored.graph.edges.length).toBe(a.graph.edges.length);
    expect(restored.graph.edges[0].evidence).toBe(
      a.graph.edges[0].evidence.trim(),
    );
    expect(restored.settings.layout).toBe("circle");
    expect(restored.settings.nodeShape).toBe("circle");
    expect(restored.settings.physics).toBe(false);
    expect(Object.values(restored.settings.positions!)).toContainEqual({
      x: 120,
      y: 200,
    });
    expect(restored.warnings.join(" ")).toContain("not been checked");
    expect(restored.id).not.toBe(a.id);
  });
  it("supports an intentionally empty graph after all concepts are deleted", () => {
    const a = demoAnalysis();
    a.graph = { nodes: [], edges: [] };
    expect(importAnalysis(jsonExport(a)).graph).toEqual({
      nodes: [],
      edges: [],
    });
  });
  it("strips unrelated fields from paragraph and concept source records", () => {
    const a = demoAnalysis();
    a.sources = [
      {
        id: "p1",
        text: "Research proof",
        paragraph: 1,
        page: 1,
        section: "Results",
        terms: [],
        key: "SOURCE-SECRET",
      } as any,
    ];
    a.graph.nodes[0].sources = [
      {
        passageId: "p1",
        quote: "Research proof",
        paragraph: 1,
        page: 1,
        section: "Results",
        key: "REFERENCE-SECRET",
      } as any,
    ];
    const output = jsonExport(a);
    expect(output).not.toContain("SECRET");
    expect(output).toContain("Research proof");
  });
  it("rejects malformed, overlarge, and unsupported imports", () => {
    expect(() => importAnalysis("bad")).toThrow("Invalid analysis");
    expect(() => importAnalysis("a".repeat(30_000_001))).toThrow("30 MB");
    expect(() => importAnalysis('{"version":5}')).toThrow("Unsupported");
  });
});
