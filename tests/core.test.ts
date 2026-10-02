import { describe, it, expect, vi, afterEach } from "vitest";
import { documentFromPages, normalizeText } from "../src/documents/text";
import {
  formatContext,
  selectContext,
  occurrences,
  mergeWindows,
  discoveryContext,
  parseTerms,
} from "../src/retrieval/context";
import {
  validateGraph,
  validateConcepts,
  parseJSON,
} from "../src/graph/validate";
import { defaults } from "../src/types";
import {
  RequestGuard,
  requestGuard,
  outputBudget,
} from "../src/providers/limits";
import {
  LLMProvider,
  endpointURL,
  providerError,
  providers,
  type ProviderId,
} from "../src/providers/client";
import { graphSchema } from "../src/providers/schema";
const doc = documentFromPages("study.pdf", [
  "Abstract\n\nOxidative stress contributes to sperm DNA damage. FSH regulates spermatogenesis. Oxidative STRESS is measured.\n\nResults\n\nSperm count is associated with infertility.",
  "Oxidative stress contributes to sperm DNA damage.",
]);
const concepts = parseTerms("oxidative stress, FSH, sperm count");
const passage = doc.passages[0];
const raw = {
  nodes: [
    { id: "a", label: "Oxidative Stress", type: "Process", aliases: [] },
    { id: "a2", label: "oxidative stress", type: "Process", aliases: [] },
    {
      id: "b",
      label: "DNA damage",
      type: "Outcome",
      aliases: ["Sperm DNA damage"],
    },
  ],
  edges: [
    {
      source: "a2",
      target: "b",
      relationship: "contributes to",
      confidence: 0.91,
      evidence: "Oxidative stress contributes to sperm DNA damage.",
      passageId: doc.passages.find((p) => p.text.includes("contributes"))!.id,
      kind: "stated",
      explanation: "The passage directly states this relationship.",
    },
  ],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  requestGuard.reset();
});
describe("local retrieval", () => {
  it("normalizes hyphenation and unicode", () =>
    expect(normalizeText("micro-\nbiome\u00ad  FSH")).toBe("microbiome FSH"));
  it("finds all case-insensitive occurrences with boundaries", () => {
    expect(occurrences("FSH fsh FSHR", "FSH")).toHaveLength(2);
    expect(
      occurrences("Oxidative STRESS and oxidative stress", "oxidative stress"),
    ).toHaveLength(2);
  });
  it("escapes arbitrary regex terms", () => {
    expect(occurrences("C++ activates A(B). [test]", "C++")).toHaveLength(1);
    expect(occurrences("A(B)", "A(B)")).toHaveLength(1);
    expect(occurrences("[test]", "[test]")).toHaveLength(1);
  });
  it("merges overlapping windows", () =>
    expect(
      mergeWindows([
        [40, 70],
        [0, 30],
        [20, 50],
        [90, 100],
      ]),
    ).toEqual([
      [0, 70],
      [90, 100],
    ]));
  it("deduplicates context and preserves page provenance", () => {
    const c = selectContext(doc, concepts, 2000);
    expect(c.matches["oxidative stress"]).toBe(3);
    expect(
      c.passages.filter(
        (p) => p.text === "Oxidative stress contributes to sperm DNA damage.",
      ),
    ).toHaveLength(1);
    expect(c.passages.every((p) => p.page && p.id && p.section)).toBe(true);
    expect(c.characters).toBeLessThan(8000);
  });
  it("reports missing concepts without an AI call", () =>
    expect(selectContext(doc, parseTerms("not here"), 2000).missing).toEqual([
      "not here",
    ]));
  it("handles a large document within a fixed budget", () => {
    const big = documentFromPages(
      "big",
      Array.from(
        { length: 100 },
        (_, i) =>
          `Page ${i}. Oxidative stress has effects. ` +
          "Other study context. ".repeat(100),
      ),
    );
    const c = selectContext(big, concepts, 500);
    expect(c.characters).toBeLessThanOrEqual(2000);
    expect(c.passages.length).toBeGreaterThan(0);
  });
  it("bounds discovery and spreads samples across the paper", () => {
    const pages = Array.from(
      { length: 20 },
      (_, i) => `Study page ${i} ${"body ".repeat(50)}`,
    );
    const sample = discoveryContext(documentFromPages("paper", pages), 1000);
    expect(
      sample.reduce((s, p) => s + p.text.length + 160, 0),
    ).toBeLessThanOrEqual(4000);
    expect(sample.some((p) => p.page! > 5)).toBe(true);
  });
  it("rejects blank documents and preserves null pages for text", () => {
    expect(() => documentFromPages("empty", [""])).toThrow("No readable text");
    expect(
      documentFromPages("txt", ["Real research text"], false).passages[0].page,
    ).toBeNull();
  });
});
describe("graph validation", () => {
  it("deduplicates nodes, maps aliases, and normalizes predicates", () => {
    const { graph } = validateGraph(raw, doc.passages, defaults);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].relationship).toBe("contributes_to");
    expect(graph.edges[0].page).toBe(1);
  });
  it("rejects fabricated evidence, dangling edges, self-loops, and bad confidence", () => {
    for (const patch of [
      { evidence: "Invented quotation from general knowledge." },
      { target: "missing" },
      { target: "a" },
      { confidence: NaN },
      { confidence: 2 },
      { passageId: "fake" },
    ]) {
      const candidate = { ...raw, edges: [{ ...raw.edges[0], ...patch }] };
      expect(
        validateGraph(candidate, doc.passages, defaults).graph.edges,
      ).toHaveLength(0);
    }
  });
  it("checks evidence against the cited passage, not another page", () => {
    expect(
      validateGraph(
        { ...raw, edges: [{ ...raw.edges[0], passageId: passage.id }] },
        [passage],
        defaults,
      ).graph.edges,
    ).toHaveLength(0);
  });
  it("deduplicates equivalent edges and excludes inferred edges by default", () => {
    expect(
      validateGraph(
        { ...raw, edges: [...raw.edges, ...raw.edges] },
        doc.passages,
        defaults,
      ).graph.edges,
    ).toHaveLength(1);
    expect(
      validateGraph(
        { ...raw, edges: [{ ...raw.edges[0], kind: "inferred" }] },
        doc.passages,
        defaults,
      ).graph.edges,
    ).toHaveLength(0);
    expect(
      validateGraph(
        { ...raw, edges: [{ ...raw.edges[0], kind: "inferred" }] },
        doc.passages,
        { ...defaults, includeInferred: true },
      ).graph.edges,
    ).toHaveLength(1);
  });
  it("removes invalid nodes and limits the graph", () => {
    expect(
      validateGraph(
        { ...raw, nodes: [...raw.nodes, null, { id: "invalid" }] },
        doc.passages,
        defaults,
      ).graph.nodes,
    ).toHaveLength(2);
    expect(
      validateGraph(raw, doc.passages, { ...defaults, maxNodes: 1 }).graph
        .nodes,
    ).toHaveLength(1);
  });
  it("rejects malformed model responses and accepts fenced JSON", () => {
    expect(() => parseJSON("bad JSON")).toThrow("malformed");
    expect(parseJSON('```json\n{"nodes":[]}\n```')).toEqual({ nodes: [] });
    expect(() => validateGraph({}, [], defaults)).toThrow("nodes and edges");
  });
  it("deduplicates and limits concept suggestions", () => {
    expect(
      validateConcepts(
        { concepts: [{ label: "FSH" }, { label: "fsh" }, { label: "DNA" }] },
        2,
      ),
    ).toHaveLength(2);
    expect(() => validateConcepts({ concepts: [] }, 30)).toThrow("No concepts");
  });
});
describe("direct provider requests", () => {
  const config = {
    provider: "openai" as const,
    key: "TEST-SECRET",
    model: "test-model",
    endpoint: "",
  };
  it.each([
    "openai",
    "anthropic",
    "gemini",
    "groq",
    "cerebras",
    "compatible",
  ] as ProviderId[])(
    "normalizes %s structured responses and uses headers for keys",
    async (provider) => {
      const payload =
        provider === "anthropic"
          ? { content: [{ type: "tool_use", name: "extract", input: raw }] }
          : provider === "gemini"
            ? {
                candidates: [
                  { content: { parts: [{ text: JSON.stringify(raw) }] } },
                ],
              }
            : { choices: [{ message: { content: JSON.stringify(raw) } }] };
      const mock = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(payload), { status: 200 }),
        );
      vi.stubGlobal("fetch", mock);
      expect(
        await new LLMProvider({
          ...config,
          provider,
          endpoint: "https://api.example.com/v1",
        }).structured("system", "excerpts", graphSchema),
      ).toEqual(raw);
      const [url, options] = mock.mock.calls[0];
      expect(url).not.toContain(config.key);
      expect(options.body).not.toContain(config.key);
      expect(Object.values(options.headers)).toContain(
        !["anthropic", "gemini"].includes(provider)
          ? "Bearer " + config.key
          : config.key,
      );
      expect(options.redirect).toBe("error");
    },
  );
  it.each(["groq", "cerebras"] as const)(
    "%s presets send strict schemas to the provider endpoint",
    async (provider) => {
      const mock = vi.fn().mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(raw) } }],
            }),
          ),
      );
      vi.stubGlobal("fetch", mock);
      for (const model of providers[provider].models) {
        await new LLMProvider(
          {
            ...config,
            provider,
            model,
            endpoint: "https://untrusted.example/v1",
          },
          new RequestGuard(),
        ).structured("system", "excerpts", graphSchema);
        const [url, options] = mock.mock.calls.at(-1)!;
        expect(url).toBe(providers[provider].endpoint + "/chat/completions");
        const body = JSON.parse(options.body);
        expect(body.response_format).toEqual({
          type: "json_schema",
          json_schema: {
            name: "research_extraction",
            strict: true,
            schema: graphSchema,
          },
        });
        expect(body.max_completion_tokens).toBe(
          outputBudget({ ...config, provider, model }, graphSchema),
        );
        expect(body.max_tokens).toBeUndefined();
        expect(body.reasoning_effort).toBe("low");
        expect(body.messages[0].content).toContain("untrusted data");
        expect(options.headers.Authorization).toBe("Bearer " + config.key);
        expect(options.body).not.toContain(config.key);
      }
    },
  );
  it.each(["groq", "cerebras"] as const)(
    "%s custom models use JSON mode with an explicit schema",
    async (provider) => {
      const mock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(raw) } }],
          }),
        ),
      );
      vi.stubGlobal("fetch", mock);
      await new LLMProvider({
        ...config,
        provider,
        model: "custom-model",
      }).structured("system", "excerpts", graphSchema);
      const body = JSON.parse(mock.mock.calls[0][1].body);
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.messages[0].content).toContain(JSON.stringify(graphSchema));
      expect(mock).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["groq", "cerebras"] as const)(
    "%s model loading uses header authentication and sends no document",
    async (provider) => {
      const mock = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: [{ id: "z-model" }, { id: "a-model" }] }),
          ),
        );
      vi.stubGlobal("fetch", mock);
      expect(
        await new LLMProvider({ ...config, provider }).listModels(),
      ).toEqual(["a-model", "z-model"]);
      const [url, options] = mock.mock.calls[0];
      expect(url).toBe(providers[provider].endpoint + "/models");
      expect(options.headers.Authorization).toBe("Bearer " + config.key);
      expect(options.body).toBeUndefined();
      expect(url).not.toContain(config.key);
    },
  );
  it.each(["groq", "cerebras"] as const)(
    "%s rejects truncated completions and reports free-tier quotas without retrying",
    async (provider) => {
      vi.useFakeTimers();
      const mock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              { finish_reason: "length", message: { content: "{broken" } },
            ],
          }),
        ),
      );
      vi.stubGlobal("fetch", mock);
      const client = new LLMProvider({ ...config, provider });
      await expect(
        client.structured("system", "excerpts", graphSchema),
      ).rejects.toThrow("truncated");
      vi.advanceTimersByTime(60001);
      mock.mockResolvedValue(new Response("", { status: 429 }));
      await expect(
        client.structured("system", "excerpts", graphSchema),
      ).rejects.toThrow("usage limits");
      expect(mock).toHaveBeenCalledTimes(2);
    },
  );
  it("surfaces malformed JSON and provider failures without retries", async () => {
    const mock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "broken" } }] }),
        ),
      );
    vi.stubGlobal("fetch", mock);
    await expect(
      new LLMProvider(config).structured("", "", graphSchema),
    ).rejects.toThrow("malformed");
    expect(mock).toHaveBeenCalledTimes(1);
    mock.mockResolvedValue(new Response("", { status: 429 }));
    await expect(
      new LLMProvider(config).structured("", "", graphSchema),
    ).rejects.toThrow("quota");
  });
  it("surfaces CORS and cancellation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(
      new LLMProvider(config).structured("", "", graphSchema),
    ).rejects.toThrow("CORS");
    const controller = new AbortController();
    controller.abort();
    await expect(
      new LLMProvider(config).structured(
        "",
        "",
        graphSchema,
        controller.signal,
      ),
    ).rejects.toThrow("cancelled");
  });
  it("validates endpoint protocols and rejects embedded secrets", () => {
    expect(() =>
      endpointURL({
        ...config,
        provider: "compatible",
        endpoint: "http://evil.example/v1",
      }),
    ).toThrow("HTTPS");
    expect(() =>
      endpointURL({
        ...config,
        provider: "compatible",
        endpoint: "https://name:password@example.com",
      }),
    ).toThrow("credentials");
    expect(
      endpointURL({
        ...config,
        provider: "compatible",
        endpoint: "http://localhost:1234/v1",
      }),
    ).toBe("http://localhost:1234/v1");
  });
  it("maps authentication and context errors", () => {
    expect(providerError(401)).toContain("denied");
    expect(providerError(413)).toContain("context");
    expect(providerError(500)).toContain("unavailable");
  });
});

describe("research-paper retrieval regressions", () => {
  it("annotates and ranks each separate window by its own matched concepts", () => {
    const doc = documentFromPages(
      "windows.txt",
      ["Alpha " + "other words ".repeat(77) + " Beta"],
      false,
    );
    const selected = selectContext(doc, parseTerms("Alpha, Beta"), 1000);
    expect(selected.passages.length).toBeGreaterThan(1);
    expect(selected.matchedPassages).toBeGreaterThanOrEqual(
      selected.passages.length,
    );
    for (const passage of selected.passages)
      for (const term of passage.terms)
        expect(occurrences(passage.text, term).length).toBeGreaterThan(0);
    expect(
      selected.passages.find((p) => p.terms.includes("Alpha"))?.terms,
    ).not.toContain("Beta");
  });
  it("keeps serialized context within budget even with long section metadata", () => {
    const doc = documentFromPages("metadata.pdf", ["Alpha evidence"]);
    doc.passages = Array.from({ length: 12 }, (_, i) => ({
      id: `p500-${12345 + i}`,
      page: 500,
      paragraph: 12345 + i,
      section: "Results " + "X".repeat(112),
      text: `Alpha paragraph ${i} ` + "evidence ".repeat(8),
      terms: [],
    }));
    const selection = selectContext(doc, parseTerms("Alpha"), 500);
    expect(formatContext(selection.passages).length).toBeLessThanOrEqual(2000);
    expect(selection.characters).toBeLessThanOrEqual(2000);
    expect(
      formatContext(discoveryContext(doc, 500)).length,
    ).toBeLessThanOrEqual(2000);
  });
  it("tracks numbered and Roman-numeral headings without relabeling preceding text", () => {
    const doc = documentFromPages("sections.pdf", [
      "Document title\nAbstract\nOpening summary.\n\n1. Introduction\nIntroductory context.",
      "2.4 Signal Models\nGravitational waves are measured.\nII. RESULTS\nReported measurements.\n\nReferences\nLiterature sources.",
    ]);
    expect(
      doc.passages.find((p) => p.text.includes("Document title"))?.section,
    ).toBe("Document");
    expect(
      doc.passages.find((p) => p.text.includes("Opening summary"))?.section,
    ).toBe("Abstract");
    expect(
      doc.passages.find((p) => p.text.includes("Introductory context"))
        ?.section,
    ).toBe("1. Introduction");
    expect(
      doc.passages.find((p) => p.text.includes("Gravitational waves"))?.section,
    ).toBe("2.4 Signal Models");
    expect(
      doc.passages.find((p) => p.text.includes("Reported measurements"))
        ?.section,
    ).toBe("II. RESULTS");
  });
  it("keeps citation lists and prose list items from becoming section labels", async () => {
    const { sectionHeading } = await import("../src/documents/text");
    expect(sectionHeading("2.4 Signal Models")).toBe("2.4 Signal Models");
    expect(
      sectionHeading(
        "1. Ground vibration. External mechanical vibrations must be screened out.",
      ),
    ).toBeNull();
    expect(
      sectionHeading("6.1 Speed of gravitational waves . . . . . . . . . 65"),
    ).toBeNull();
    expect(sectionHeading("4.2 Model ................. 20")).toBeNull();
  });
  it("rejects false headings observed in the public paper corpus", async () => {
    const { sectionHeading } = await import("../src/documents/text");
    for (const line of [
      "2014 English-French dataset consisting of 36M sentences",
      "64000 Pau – France",
      "76 Ninth Avenue",
      "1 LIGO, California Institute of Technology, Pasadena, California 91125, USA",
      "1 In one dimension, you can use the inverse cumulative distribution function",
      "1 Σ 0",
      "1159388 PMID: 19197054",
      "08 November 2007):",
      "1 A New Window onto the Universe 5",
      "1 Mpc",
      "2. Learned approximate inference can be performed by training an auxiliary network to predict z",
    ])
      expect(sectionHeading(line), line).toBeNull();
    expect(sectionHeading("6.1 Speed of gravitational waves")).toBe(
      "6.1 Speed of gravitational waves",
    );
    expect(sectionHeading("3. Model Architecture")).toBe(
      "3. Model Architecture",
    );
  });
});
