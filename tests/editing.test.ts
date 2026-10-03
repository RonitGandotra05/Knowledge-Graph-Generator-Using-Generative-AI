import { describe, it, expect } from "vitest";
import {
  editNode,
  deleteNode,
  editRelationship,
  nodeColor,
} from "../src/graph/edit";
import { attachProvenance, quoteRange } from "../src/graph/provenance";
import { documentFromPages } from "../src/documents/text";
import { selectContext, parseTerms } from "../src/retrieval/context";
import { validateGraph } from "../src/graph/validate";
import { defaults } from "../src/types";
import { demoAnalysis } from "../src/ui/demo";
import { jsonExport, importAnalysis } from "../src/graph/export";
import { safeDraft, type Draft } from "../src/storage/drafts";
describe("source mapping and graph edits", () => {
  function fixture() {
    const doc = documentFromPages("paper.pdf", [
      "Abstract\n\nThe Transformer uses attention.\nThe encoder and decoder are connected.",
    ]);
    const selected = selectContext(
      doc,
      parseTerms("Transformer, attention, decoder"),
      1000,
    ).passages;
    const { graph } = validateGraph(
      {
        nodes: [
          { id: "a", label: "Transformer" },
          { id: "b", label: "attention" },
          { id: "c", label: "decoder" },
        ],
        edges: [
          {
            source: "a",
            target: "b",
            relationship: "uses",
            confidence: 0.8,
            evidence: "The Transformer uses attention.",
            passageId: selected[0].id,
            kind: "stated",
          },
        ],
      },
      selected,
      defaults,
    );
    const sources = attachProvenance(graph, doc, selected);
    return { doc, graph, sources };
  }
  it("maps a window back to its full paragraph and maps isolated nodes locally", () => {
    const { doc, graph, sources } = fixture();
    expect(graph.edges[0]).toMatchObject({
      passageId: doc.passages[1].id,
      paragraph: 2,
      page: 1,
    });
    expect(sources[0].text).toContain("decoder");
    expect(graph.nodes[2].sources?.[0]).toMatchObject({
      paragraph: 2,
      page: 1,
    });
    expect(
      quoteRange(sources[0].text, "THE Transformer   uses attention."),
    ).toEqual([0, 31]);
    expect(quoteRange("proof text", "fabricated")).toBeNull();
  });
  it("preserves source proof when editing, rejects duplicate labels, and cascades deletion", () => {
    const { graph } = fixture();
    const updated = editNode(
      graph,
      "n1",
      "My Transformer",
      "Method",
      "#abcdef",
    );
    expect(updated.nodes[0].sources).toEqual(graph.nodes[0].sources);
    expect(updated.nodes[0].edited).toBe(true);
    expect(graph.nodes[0].label).toBe("Transformer");
    expect(() =>
      editNode(graph, "n1", "attention", "Method", "#abcdef"),
    ).toThrow("already");
    const edge = editRelationship(
      updated,
      "e1",
      "uses revised",
      "My interpretation",
    );
    expect(edge.edges[0].evidence).toBe(graph.edges[0].evidence);
    expect(edge.edges[0].edited).toBe(true);
    const deleted = deleteNode(edge, "n1");
    expect(deleted.nodes).toHaveLength(2);
    expect(deleted.edges).toHaveLength(0);
    expect(
      new Set(Array.from({ length: 150 }, (_, i) => nodeColor(i))).size,
    ).toBe(150);
  });
  it("round-trips source paragraphs, edited annotations, colors, and locations", () => {
    const { graph, sources } = fixture();
    const a = demoAnalysis();
    a.graph = editRelationship(
      editNode(graph, "n1", "My Transformer", "Method", "#abcdef"),
      "e1",
      "uses revised",
      "My note",
    );
    a.sources = sources;
    const restored = importAnalysis(jsonExport(a));
    expect(restored.graph.nodes[0]).toMatchObject({
      label: "My Transformer",
      color: "#abcdef",
      edited: true,
    });
    expect(restored.graph.nodes[0].sources?.[0].paragraph).toBe(2);
    expect(restored.graph.edges[0]).toMatchObject({
      paragraph: 2,
      page: 1,
      edited: true,
    });
    expect(restored.sources).toEqual(sources);
  });
  it("never serializes credentials from provider configuration in drafts", () => {
    const raw = {
      id: "draft",
      name: "Paper",
      updatedAt: "now",
      status: "ongoing",
      step: 1,
      focus: "attention",
      keywords: "Transformer",
      document: null,
      concepts: [],
      options: defaults,
      provider: {
        provider: "groq",
        model: "m",
        endpoint: "https://api.groq.com",
        key: "SECRET-KEY",
      },
      analysis: null,
      discoverySignature: "signature",
      key: "TOP-SECRET",
    };
    const serialized = JSON.stringify(safeDraft(raw as Draft));
    expect(serialized).not.toContain("SECRET");
    expect(JSON.parse(serialized).focus).toBe("attention");
  });
});

import { addNode, addRelationship, deleteNodes } from "../src/graph/edit";
import { appearanceSettings } from "../src/graph/settings";

describe("personal graph authoring", () => {
  it("round-trips personal notes, manual connections and appearance without inventing evidence", () => {
    const a = demoAnalysis();
    a.graph = addNode(
      a.graph,
      "My hypothesis",
      "Personal",
      "#abcdef",
      "Check this next week\n<not html>",
    );
    const n = a.graph.nodes.at(-1)!;
    a.graph = addRelationship(
      a.graph,
      n.id,
      a.graph.nodes[0].id,
      "may relate to",
      "A connection I want to explore",
    );
    a.settings = {
      ...a.settings,
      graphScale: 0.7,
      nodeSize: 1.2,
      nodeFontSize: 18,
      edgeFontSize: 8,
      edgeLength: 0,
      showEdgeLabels: false,
      nodeShape: "diamond",
    };
    const restored = importAnalysis(jsonExport(a));
    expect(restored.settings).toMatchObject(a.settings);
    expect(
      restored.graph.nodes.find((n) => n.label === "My hypothesis")?.notes,
    ).toBe("Check this next week\n<not html>");
    const manual = restored.graph.edges.find((e) => e.manual)!;
    expect(manual).toMatchObject({
      relationship: "may_relate_to",
      explanation: "A connection I want to explore",
      evidence: "",
      passageId: "",
      manual: true,
    });
    expect(restored.graph.edges).toHaveLength(a.graph.edges.length);
    expect(restored.warnings.some((w) => w.includes("invalid"))).toBe(false);
    const remaining = deleteNodes(restored.graph, [
      manual.source,
      manual.target,
    ]);
    expect(remaining.nodes).toHaveLength(restored.graph.nodes.length - 2);
    expect(
      remaining.edges.some(
        (e) =>
          [manual.source, manual.target].includes(e.source) ||
          [manual.source, manual.target].includes(e.target),
      ),
    ).toBe(false);
  });
  it("validates endpoints, duplicates, notes and hostile appearance values", () => {
    const graph = demoAnalysis().graph,
      [a, b, c] = graph.nodes;
    expect(() => addRelationship(graph, a.id, a.id, "relates", "")).toThrow(
      "different",
    );
    expect(() =>
      addRelationship(graph, a.id, "missing", "relates", ""),
    ).toThrow("existing");
    const added = addRelationship(
      graph,
      a.id,
      b.id,
      "custom relationship",
      "note",
    );
    expect(() =>
      addRelationship(added, a.id, b.id, "custom relationship", ""),
    ).toThrow("already");
    const edge = added.edges.at(-1)!;
    const rewired = editRelationship(
      added,
      edge.id,
      "custom relationship",
      "new note",
      a.id,
      c.id,
    );
    expect(rewired.edges.at(-1)).toMatchObject({
      source: a.id,
      target: c.id,
      explanation: "new note",
    });
    expect(
      appearanceSettings({
        graphScale: NaN,
        nodeFontSize: Infinity,
        edgeLength: -5,
        edgeFontSize: 900,
      }),
    ).toMatchObject({
      graphScale: 1,
      nodeFontSize: 15,
      edgeLength: 0,
      edgeFontSize: 18,
    });
    expect(
      addNode(graph, "New", "Personal", "#abcdef", "x".repeat(5000)).nodes.at(
        -1,
      )?.notes,
    ).toHaveLength(4000);
  });
});
