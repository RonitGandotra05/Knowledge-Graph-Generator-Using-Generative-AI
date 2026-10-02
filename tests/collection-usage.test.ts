import { describe, it, expect } from "vitest";
import { combineDocuments } from "../src/documents/collection";
import { documentFromPages } from "../src/documents/text";
import { attachProvenance } from "../src/graph/provenance";
import { coverageBatches, discoverCoverage } from "../src/providers/coverage";
import { validateGraph } from "../src/graph/validate";
import {
  reportedUsage,
  tokenCost,
  priceFor,
  emptyUsage,
  addUsage,
  safeUsage,
} from "../src/providers/usage";
import { estimateRun } from "../src/providers/estimate";
import { defaults, type KnowledgeGraph, type PaperRecord } from "../src/types";
import type { LLMProvider, ProviderConfig } from "../src/providers/client";
const config: ProviderConfig = {
  provider: "groq",
  model: "openai/gpt-oss-20b",
  endpoint: "https://api.groq.com/openai/v1",
  key: "NEVER-PERSIST",
};
const paper = (
  id: string,
  name: string,
  status: PaperRecord["status"] = "ready",
): PaperRecord => ({
  id,
  name,
  status,
  pages: 1,
  characters: 80,
  ocrPages: [],
  skippedPages: [],
});
const collection = () =>
  combineDocuments([
    {
      paper: paper("a", "one.pdf"),
      document: documentFromPages("one.pdf", [
        "Alpha is associated with Beta in the first study.",
      ]),
    },
    {
      paper: paper("b", "two.pdf"),
      document: documentFromPages("two.pdf", [
        "Alpha inhibits Beta in the second study.",
      ]),
    },
    {
      paper: { ...paper("bad", "bad.pdf", "failed"), error: "Invalid PDF" },
      document: null,
    },
  ])!;
const concepts = ["Alpha", "Beta"].map((label) => ({
  label,
  type: "Concept",
  aliases: [],
  selected: true,
}));
describe("multi-paper provenance and continuation", () => {
  it("separates identical page/paragraph numbers and excludes failed papers from prompts", () => {
    const doc = collection();
    expect(doc.pages).toBe(2);
    expect(new Set(doc.passages.map((p) => p.id)).size).toBe(2);
    const batches = coverageBatches(doc, 6000);
    expect(batches.length).toBe(2);
    expect(
      batches.every((b) => new Set(b.map((p) => p.paperId)).size === 1),
    ).toBe(true);
    expect(doc.passages.some((p) => p.paperName === "bad.pdf")).toBe(false);
    const source = doc.passages[1];
    const validated = validateGraph(
      {
        nodes: concepts.map((c, i) => ({ ...c, id: "n" + (i + 1) })),
        edges: [
          {
            source: "n1",
            target: "n2",
            relationship: "inhibits",
            evidence: source.text,
            passageId: source.id,
            confidence: 0.8,
            kind: "stated",
            explanation: "This paper reports inhibition.",
          },
        ],
      },
      doc.passages,
      defaults,
      true,
    );
    expect(validated.graph.edges[0].paperName).toBe("two.pdf");
    const sources = attachProvenance(validated.graph, doc, [source]);
    expect(validated.graph.edges[0].passageId).toBe("b:p1-1");
    expect(sources.find((p) => p.id === "b:p1-1")?.text).toContain("inhibits");
    expect(validated.graph.nodes[0].sources?.map((p) => p.paperName)).toEqual([
      "one.pdf",
      "two.pdf",
    ]);
  });
  it("resumes discovery without repeating the completed paper", async () => {
    const seen: string[] = [];
    const provider = {
      structured: async (_s: string, p: string) => {
        seen.push(p);
        return { concepts: [{ label: "Beta", type: "Concept", aliases: [] }] };
      },
    } as unknown as LLMProvider;
    const result = await discoverCoverage(
      provider,
      collection(),
      [],
      defaults,
      "focus",
      new AbortController().signal,
      async () => {},
      async () => {},
      { completed: [0], concepts: [concepts[0]] },
    );
    expect(seen.length).toBe(1);
    expect(seen[0]).toContain("two.pdf");
    expect(seen[0]).not.toContain("one.pdf");
    expect(result.concepts.length).toBe(2);
  });
  it("does not build an empty successful collection when every paper failed", () => {
    expect(
      combineDocuments([
        { paper: paper("bad", "bad.pdf", "failed"), document: null },
      ]),
    ).toBeNull();
  });
});
describe("actual provider accounting", () => {
  it("includes reasoning output and discounts cached OpenAI input", () => {
    const u = reportedUsage("openai", {
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        prompt_tokens_details: { cached_tokens: 300 },
        completion_tokens_details: { reasoning_tokens: 200 },
      },
    })!;
    expect(u.totalTokens).toBe(1500);
    expect(u.outputTokens).toBe(500);
    expect(
      tokenCost(
        u,
        priceFor({ ...config, provider: "openai", model: "gpt-4.1-mini" }),
      ),
    ).toBeCloseTo((700 * 0.4 + 300 * 0.1 + 500 * 1.6) / 1e6);
  });
  it("sums Anthropic base/read/write input without losing cache tokens", () => {
    const u = reportedUsage("anthropic", {
      usage: {
        input_tokens: 100,
        output_tokens: 40,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 50,
      },
    })!;
    expect(u.inputTokens).toBe(350);
    expect(u.totalTokens).toBe(390);
    expect(
      tokenCost(
        u,
        priceFor({
          ...config,
          provider: "anthropic",
          model: "claude-sonnet-4-5",
        }),
      ),
    ).toBeCloseTo((100 * 3 + 200 * 0.3 + 50 * 3.75 + 40 * 15) / 1e6);
  });
  it("counts Gemini thinking as output using total usage and cache discount", () => {
    const u = reportedUsage("gemini", {
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        thoughtsTokenCount: 200,
        totalTokenCount: 350,
        cachedContentTokenCount: 40,
      },
    })!;
    expect(u.outputTokens).toBe(250);
    expect(u.totalTokens).toBe(350);
  });
  it("marks missing usage unknown rather than reporting invented actual tokens", () => {
    expect(reportedUsage("groq", {})).toBeNull();
    const totals = addUsage(emptyUsage(), {
      usage: null,
      reservedTokens: 3000,
      durationMs: 10,
      status: 0,
      config,
    });
    expect(totals.unknownCalls).toBe(1);
    expect(totals.totalTokens).toBe(0);
    expect(totals.estimatedCostUSD).toBeNull();
  });
  it("never assigns public pricing to a private or lookalike compatible endpoint", () => {
    expect(
      priceFor({
        ...config,
        provider: "compatible",
        endpoint: "https://api.groq.com.evil.test/openai/v1",
      }),
    ).toBeNull();
    expect(
      priceFor({
        ...config,
        provider: "compatible",
        endpoint: "https://private.test/v1",
      }),
    ).toBeNull();
    expect(priceFor({ ...config, provider: "compatible" })).not.toBeNull();
    expect(priceFor({ ...config, model: "unknown" })).toBeNull();
  });
  it("distinguishes declared free plans from published paid charges", () => {
    const u = {
      inputTokens: 1000,
      outputTokens: 1000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 2000,
    };
    expect(tokenCost(u, priceFor(config), "free")).toBe(0);
    expect(tokenCost(u, priceFor(config))).toBeCloseTo(0.000375);
  });
  it("whitelists safe accounting fields and drops secrets or raw responses", () => {
    const safe = safeUsage({
      ...emptyUsage(),
      ...({
        key: "NEVER-PERSIST",
        raw: { credential: "NEVER-PERSIST" },
      } as any),
    });
    expect(JSON.stringify(safe)).not.toContain("NEVER-PERSIST");
  });
  it("retains billed usage even when a graph result is subsequently rejected", () => {
    const u = reportedUsage("groq", {
      usage: { prompt_tokens: 800, completion_tokens: 200, total_tokens: 1000 },
    })!;
    const total = addUsage(emptyUsage(), {
      usage: u,
      reservedTokens: 2500,
      durationMs: 400,
      status: 200,
      config,
    });
    expect(total.calls).toBe(1);
    expect(total.reportedCalls).toBe(1);
    expect(total.totalTokens).toBe(1000);
  });
});
describe("preflight and remaining estimates", () => {
  it("estimates both discovery and relation passes with token-limited pacing", () => {
    const doc = collection();
    const e = estimateRun(doc, [], config, {
      ...defaults,
      contextTokens: 1000,
    });
    expect(e.calls).toBe(4);
    expect(e.tokenCeiling).toBeGreaterThan(e.inputTokens + e.outputTokens);
    expect(e.requestsPerMinute).toBe(20);
    expect(e.tokensPerMinute).toBe(6000);
    expect(e.durationCeilingMs).toBeGreaterThanOrEqual(e.durationMs);
    expect(e.costUSD).toBeGreaterThan(0);
  });
  it("subtracts completed requests and refines relations after discovery", () => {
    const e = estimateRun(
      collection(),
      concepts,
      config,
      defaults,
      true,
      [0, 1],
      [0],
    );
    expect(e.discoveryCalls).toBe(0);
    expect(e.relationshipCalls).toBe(1);
    expect(
      estimateRun(
        collection(),
        concepts,
        config,
        defaults,
        true,
        [0, 1],
        [0, 1],
      ).calls,
    ).toBe(0);
  });
  it("shows daily-quota windows for large papers instead of promising minutes", () => {
    const doc = documentFromPages(
      "large.pdf",
      Array.from({ length: 100 }, () => "Alpha relates to Beta. ".repeat(100)),
    );
    const e = estimateRun(doc, concepts, config, {
      ...defaults,
      contextTokens: 500,
    });
    expect(e.quotaDays).toBeGreaterThan(1);
    expect(e.durationMs).toBeGreaterThan(86400000);
    expect(e.durationCeilingMs).toBeGreaterThan(86400000);
  });
});

describe("billing and evidence regression details", () => {
  it("keeps the same claim supported by different papers as separate cited edges", () => {
    const doc = collection();
    const nodes = concepts.map((c, i) => ({ ...c, id: `n${i + 1}` }));
    const edges = doc.passages.map((p) => ({
      source: "n1",
      target: "n2",
      relationship: "associated_with",
      confidence: 0.8,
      evidence: p.text,
      passageId: p.id,
      kind: "stated",
      explanation: "Traceable test double.",
    }));
    expect(
      validateGraph({ nodes, edges }, doc.passages, defaults, true).graph.edges,
    ).toHaveLength(2);
  });
  it("updates remaining duration from observed request latency without changing token/cost estimates", () => {
    const paid = {
      ...config,
      provider: "openai" as const,
      model: "gpt-4.1-mini",
    };
    const before = estimateRun(
      collection(),
      concepts,
      paid,
      defaults,
      true,
      [],
      [],
    );
    const after = estimateRun(
      collection(),
      concepts,
      paid,
      defaults,
      true,
      [],
      [],
      false,
      1000,
    );
    expect(after.durationMs).toBeLessThan(before.durationMs);
    expect(after.costUSD).toBe(before.costUSD);
  });
});
