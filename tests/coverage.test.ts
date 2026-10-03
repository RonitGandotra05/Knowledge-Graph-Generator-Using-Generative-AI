import { describe, it, expect } from "vitest";
import {
  coverageBatches,
  mergeGroundedConcepts,
  extractCoverage,
} from "../src/providers/coverage";
import { documentFromPages } from "../src/documents/text";
import { attachProvenance } from "../src/graph/provenance";
import { defaults } from "../src/types";
import { validateGraph } from "../src/graph/validate";
import type { LLMProvider } from "../src/providers/client";

describe("complete evidence coverage", () => {
  it("traverses every paragraph and page within small budgets, retaining source IDs", () => {
    const doc = documentFromPages(
      "multi.pdf",
      Array.from({ length: 14 }, (_, i) =>
        `UniqueMarker${i} significant findings. `.repeat(100),
      ),
    );
    const batches = coverageBatches(doc, 1000),
      all = batches.flat();
    expect(batches.length).toBeGreaterThan(14);
    for (const p of doc.passages)
      expect(
        all.some((a) => a.id === p.id || a.id.startsWith(p.id + "@")),
      ).toBe(true);
    expect(new Set(all.map((p) => p.page)).size).toBe(14);
    expect(all.every((p) => p.text.length <= 3000)).toBe(true);
  });
  it("merges grounded aliases but rejects invented synonyms and unsupported concepts", () => {
    const doc = documentFromPages("paper", [
      "ASD is studied using K02014 and TC.FEV.OM.",
    ]);
    const candidates = [
      {
        label: "Autism spectrum disorder",
        aliases: ["ASD", "invented disease"],
        type: "Condition",
        selected: true,
      },
      { label: "ASD", aliases: [], type: "Condition", selected: true },
      {
        label: "K02014",
        aliases: ["TC.FEV.OM", "invented gene"],
        type: "Gene",
        selected: true,
      },
      {
        label: "Unreported finding",
        aliases: [],
        type: "Gene",
        selected: true,
      },
    ];
    const merged = mergeGroundedConcepts(candidates, doc);
    expect(merged).toHaveLength(2);
    expect(merged.flatMap((c) => c.aliases)).not.toContain("invented gene");
    expect(merged.flatMap((c) => c.aliases)).not.toContain("invented disease");
  });
  it("retains isolated grounded nodes, rejects invented quotes, and keeps exact page evidence", async () => {
    const doc = documentFromPages("paper.pdf", [
      "Alpha is associated with Beta. Gamma is also measured.",
    ]);
    const concepts = ["Alpha", "Beta", "Gamma"].map((label) => ({
      label,
      type: "Concept",
      aliases: [],
      selected: true,
    }));
    const edge = {
      source: "n1",
      target: "n2",
      relationship: "associated_with",
      confidence: 0.8,
      evidence: "Alpha is associated with Beta.",
      passageId: doc.passages[0].id,
      kind: "stated",
      explanation: "Association, not causation.",
    };
    const provider = {
      structured: async () => ({
        edges: [
          edge,
          {
            ...edge,
            source: "n3",
            evidence: "Invented statement without proof.",
          },
        ],
      }),
    } as unknown as LLMProvider;
    const result = await extractCoverage(
      provider,
      doc,
      concepts,
      { ...defaults, contextTokens: 1000 },
      new AbortController().signal,
      async () => {},
    );
    expect(result.graph.nodes).toHaveLength(3);
    expect(result.graph.edges).toHaveLength(1);
    expect(result.graph.edges[0].page).toBe(1);
    expect(result.warnings.some((w) => w.includes("retained"))).toBe(true);
    attachProvenance(result.graph, doc, result.passages);
    expect(result.graph.nodes.every((n) => n.sources?.length)).toBe(true);
  });
});

it("resumes a failed extraction without resending completed evidence sections", async () => {
  const text =
    "Alpha is associated with Beta. " +
    "Measured observations are recorded carefully. ".repeat(24);
  const doc = documentFromPages("two-pages.pdf", [text, text, text, text]);
  const concepts = ["Alpha", "Beta"].map((label) => ({
    label,
    type: "Concept",
    aliases: [],
    selected: true,
  }));
  const batches = coverageBatches(doc, 500);
  let completed:
      import("../src/providers/coverage").ExtractionProgress | undefined,
    initialCalls = 0;
  const response = (prompt: string) => {
    const match = prompt.match(/\[([^\]]+)\] Page:/)!;
    return {
      edges: [
        {
          source: "n1",
          target: "n2",
          relationship: "associated_with",
          confidence: 0.8,
          evidence: "Alpha is associated with Beta.",
          passageId: match[1],
          kind: "stated",
          explanation: "Association.",
        },
      ],
    };
  };
  const failing = {
    structured: async (_: string, prompt: string) => {
      if (++initialCalls === 2) throw new Error("Provider unavailable");
      return response(prompt);
    },
  } as unknown as LLMProvider;
  await expect(
    extractCoverage(
      failing,
      doc,
      concepts,
      { ...defaults, contextTokens: 500 },
      new AbortController().signal,
      async () => {},
      async (p) => {
        completed = structuredClone(p);
      },
    ),
  ).rejects.toThrow("Provider unavailable");
  expect(completed?.completed).toHaveLength(1);
  expect(completed?.edges).toHaveLength(1);
  let resumeCalls = 0;
  const succeeding = {
    structured: async (_: string, prompt: string) => {
      resumeCalls++;
      return response(prompt);
    },
  } as unknown as LLMProvider;
  const result = await extractCoverage(
    succeeding,
    doc,
    concepts,
    { ...defaults, contextTokens: 500 },
    new AbortController().signal,
    async () => {},
    undefined,
    completed,
  );
  const relevant = batches.filter((batch) =>
    batch.some((p) => p.text.includes("Alpha") && p.text.includes("Beta")),
  ).length;
  expect(resumeCalls).toBe(relevant - 1);
  expect(result.graph.edges).toHaveLength(1);
  expect(result.calls).toBe(relevant);
});

it("rejects a biological system miscast as a metric and causal claims supported only by hedged quotes", async () => {
  const { validateGraph } = await import("../src/graph/validate");
  const doc = documentFromPages("roles", [
    "PERMANOVA analyzes the gut microbiome using Manhattan distance. Microbe Alpha may cause inflammation in Condition Beta.",
  ]);
  const nodes = [
    {
      id: "method",
      label: "PERMANOVA",
      type: "statistical method",
      aliases: [],
    },
    {
      id: "system",
      label: "Gut microbiome",
      type: "biological system",
      aliases: [],
    },
    { id: "microbe", label: "Alpha", type: "microbe", aliases: [] },
    { id: "disease", label: "Beta", type: "condition", aliases: [] },
  ];
  const edge = {
    source: "method",
    target: "system",
    relationship: "uses_metric",
    confidence: 0.9,
    evidence: "PERMANOVA analyzes the gut microbiome using Manhattan distance.",
    passageId: doc.passages[0].id,
    kind: "stated",
    explanation: "Incorrect role.",
  };
  const result = validateGraph(
    {
      nodes,
      edges: [
        edge,
        {
          ...edge,
          source: "microbe",
          target: "disease",
          relationship: "causes",
          evidence: "Microbe Alpha may cause inflammation in Condition Beta.",
        },
        { ...edge, relationship: "analyzes" },
      ],
    },
    doc.passages,
    defaults,
  );
  expect(result.graph.edges).toHaveLength(1);
  expect(result.graph.edges[0].relationship).toBe("analyzes");
});

it("excludes identified bibliography sections while retaining all body passages", () => {
  const doc = documentFromPages("paper.pdf", [
    "Introduction\nAlpha studies Beta.\n\nReferences\nUnrelatedTitle studies Gamma.",
  ]);
  const sent = coverageBatches(doc, 1000).flat();
  expect(sent.some((p) => p.text.includes("Alpha"))).toBe(true);
  expect(sent.some((p) => p.text.includes("UnrelatedTitle"))).toBe(false);
});
it("merges a single KEGG identifier without collapsing distinct genes", () => {
  const doc = documentFromPages("paper", [
    "K02014 (TC.FEV.OM) and K03585 (acrA) were reported. K02014 is a feature.",
  ]);
  const concepts = ["K02014 (TC.FEV.OM)", "K02014", "K03585 (acrA)"].map(
    (label) => ({ label, type: "Gene", aliases: [], selected: true }),
  );
  const merged = mergeGroundedConcepts(concepts, doc);
  expect(merged).toHaveLength(2);
  expect(merged[0].aliases).toContain("K02014");
});
it("requires both endpoints in generated evidence and ignores model-supplied edit flags", async () => {
  const doc = documentFromPages("paper", [
    "Alpha is measured carefully.\n\nBeta is measured independently.",
  ]);
  const concepts = ["Alpha", "Beta"].map((label) => ({
    label,
    type: "Concept",
    aliases: [],
    selected: true,
  }));
  const provider = {
    structured: async () => ({
      edges: [
        {
          source: "n1",
          target: "n2",
          relationship: "associated_with",
          confidence: 0.8,
          evidence: "Alpha is measured carefully.",
          passageId: doc.passages[0].id,
          kind: "stated",
          explanation: "Unsupported",
          edited: true,
        },
      ],
    }),
  } as unknown as LLMProvider;
  const result = await extractCoverage(
    provider,
    doc,
    concepts,
    defaults,
    new AbortController().signal,
    async () => {},
  );
  expect(result.graph.edges).toHaveLength(0);
});
it("preserves hyphens in uppercase scientific identifiers across line breaks", async () => {
  const { normalizeText } = await import("../src/documents/text");
  expect(normalizeText("K06147 (ABCB-\nBAC) genes")).toBe(
    "K06147 (ABCB-BAC) genes",
  );
});
it("does not merge a condition with its control group or admit bibliography-only entities", () => {
  const doc = documentFromPages("paper", [
    "ASD differs from control.\n\nReferences\nUnrelatedGene appeared in a citation title.",
  ]);
  const candidates = [
    { label: "ASD", type: "Condition", aliases: ["control"], selected: true },
    { label: "control", type: "Cohort", aliases: [], selected: true },
    { label: "UnrelatedGene", type: "Gene", aliases: [], selected: true },
  ];
  const merged = mergeGroundedConcepts(candidates, doc);
  expect(merged).toHaveLength(2);
  expect(merged[0].aliases).not.toContain("control");
  expect(merged[1].label).toBe("control");
});
it("merges technical suffix variants without collapsing a clinical condition into a pathway", () => {
  const doc = documentFromPages("paper", [
    "Random Forest and random forest classifier use features. Alpha-diversity analysis and alpha diversity were measured. Autism and Autism pathway are different concepts.",
  ]);
  const candidates = [
    { label: "Random Forest", type: "Classifier" },
    { label: "random forest classifier", type: "Method" },
    { label: "Alpha-diversity analysis", type: "metric" },
    { label: "alpha diversity", type: "measure" },
    { label: "Autism", type: "Condition" },
    { label: "Autism pathway", type: "Pathway" },
  ].map((c) => ({ ...c, aliases: [], selected: true }));
  const merged = mergeGroundedConcepts(candidates, doc);
  expect(merged).toHaveLength(4);
  expect(merged.some((c) => c.label === "Autism")).toBe(true);
  expect(merged.some((c) => c.label === "Autism pathway")).toBe(true);
});
it("normalizes condition-to-feature direction and method-to-feature roles", async () => {
  const { validateGraph } = await import("../src/graph/validate");
  const doc = documentFromPages("paper", [
    "Condition Alpha has a reported feature Beta. Method Gamma identifies Beta.",
  ]);
  const nodes = [
    { id: "a", label: "Alpha", type: "Condition", aliases: [] },
    { id: "b", label: "Beta", type: "Taxon", aliases: [] },
    { id: "c", label: "Gamma", type: "Method", aliases: [] },
  ];
  const edge = {
    source: "a",
    target: "b",
    relationship: "reported_as_biomarker_for",
    evidence: doc.passages[0].text,
    passageId: doc.passages[0].id,
    kind: "stated",
    explanation: "Reported feature",
    confidence: 0.8,
  };
  const result = validateGraph(
    {
      nodes,
      edges: [
        edge,
        { ...edge, source: "c", relationship: "identified_as_biomarker_for" },
      ],
    },
    doc.passages,
    defaults,
    true,
  );
  expect(result.graph.edges.map((e) => e.relationship)).toEqual([
    "has_reported_feature",
    "identifies",
  ]);
});
it("grounds compact scientific labels across an explicitly inserted acronym while retaining source offsets", async () => {
  const { occurrences } = await import("../src/retrieval/context");
  const text = "ATP-binding cassette (ABC) transporter requires ATP.";
  const ranges = occurrences(text, "ATP-binding cassette transporter");
  expect(ranges).toHaveLength(1);
  expect(text.slice(...ranges[0])).toBe(
    "ATP-binding cassette (ABC) transporter",
  );
  expect(
    occurrences("enzyme (unrelated) transporter", "enzyme transporter"),
  ).toHaveLength(0);
});

it("does not turn an adverse event occurrence in comparator groups into a stated cause", () => {
  const evidence =
    "Bell’s palsy occurred in the vaccine group and the placebo group during the observation period of the trial.";
  const doc = documentFromPages("trial.pdf", [evidence]);
  const nodes = [
    { id: "v", label: "vaccine", type: "Intervention", aliases: [] },
    { id: "b", label: "Bell’s palsy", type: "Condition", aliases: [] },
  ];
  const edge = {
    source: "v",
    target: "b",
    relationship: "causes",
    kind: "stated",
    confidence: 0.9,
    evidence,
    passageId: doc.passages[0].id,
  };
  expect(
    validateGraph({ nodes, edges: [edge] }, doc.passages, defaults).graph.edges,
  ).toHaveLength(0);
  expect(
    validateGraph(
      { nodes, edges: [{ ...edge, relationship: "events_reported_after" }] },
      doc.passages,
      defaults,
    ).graph.edges,
  ).toHaveLength(1);
  const causalDoc = documentFromPages("mechanism.pdf", [
    "The vaccine caused Bell’s palsy in the control group through the explicitly established mechanism.",
  ]);
  expect(
    validateGraph(
      {
        nodes,
        edges: [
          {
            ...edge,
            evidence: causalDoc.passages[0].text,
            passageId: causalDoc.passages[0].id,
          },
        ],
      },
      causalDoc.passages,
      defaults,
    ).graph.edges,
  ).toHaveLength(1);
});
