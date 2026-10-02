import { describe, it, expect, vi, afterEach } from "vitest";
import {
  RequestGuard,
  requestPolicy,
  safeOptions,
  estimatedInputTokens,
  outputBudget,
} from "../src/providers/limits";
import { LLMProvider, type ProviderConfig } from "../src/providers/client";
import { clearLegacyKeys } from "../src/storage/history";
import { graphSchema, conceptSchema } from "../src/providers/schema";
import { defaults } from "../src/types";
const config: ProviderConfig = {
  provider: "groq",
  key: "DUMMY-KEY",
  model: "openai/gpt-oss-20b",
  endpoint: "",
};
afterEach(() => vi.unstubAllGlobals());
describe("starter request budgets", () => {
  it("caps known models, uses smaller budgets for unknown models, and covers compatible aliases", () => {
    expect(safeOptions(config, defaults)).toMatchObject({
      contextTokens: 1000,
      maxNodes: 150,
      maxEdges: 500,
    });
    const cerebras = {
      ...config,
      provider: "cerebras" as const,
      model: "qwen-3.8-27b",
    };
    expect(safeOptions(cerebras, defaults)).toMatchObject({
      contextTokens: 2000,
      maxNodes: 150,
      maxEdges: 500,
    });
    expect(
      safeOptions({ ...config, model: "unlisted" }, defaults),
    ).toMatchObject({ contextTokens: 500, maxNodes: 150, maxEdges: 500 });
    expect(
      safeOptions(
        {
          ...config,
          provider: "compatible",
          endpoint: "https://api.groq.com/openai/v1",
        },
        defaults,
      ),
    ).toEqual(safeOptions(config, defaults));
    expect(
      safeOptions(
        {
          ...config,
          provider: "compatible",
          endpoint: "https://api.cerebras.ai/v1",
          model: cerebras.model,
        },
        defaults,
      ),
    ).toEqual(safeOptions(cerebras, defaults));
    expect(safeOptions({ ...config, provider: "openai" }, defaults)).toEqual(
      defaults,
    );
  });
  it("counts instructions/schema/metadata and uses a smaller discovery completion", () => {
    expect(
      estimatedInputTokens({ system: "x".repeat(1200), schema: graphSchema }),
    ).toBeGreaterThan(400);
    expect(outputBudget(config, conceptSchema)).toBeLessThan(
      outputBudget(config, graphSchema),
    );
  });
  it("uses the same completion cap for compatible Groq and Cerebras endpoints", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
          ),
      );
    vi.stubGlobal("fetch", fetch);
    for (const [endpoint, model, expected] of [
      ["https://api.groq.com/openai/v1", "openai/gpt-oss-20b", 2600],
      ["https://api.cerebras.ai/v1", "qwen-3.8-27b", 5000],
    ] as const) {
      await new LLMProvider(
        { ...config, provider: "compatible", endpoint, model },
        new RequestGuard(),
      ).structured("system", "excerpts", graphSchema);
      const body = JSON.parse(fetch.mock.calls.at(-1)![1].body);
      expect(body.max_tokens).toBe(expected);
      expect(body.reasoning_effort).toBe("low");
      expect(body.max_completion_tokens).toBeUndefined();
    }
  });
  it("rejects oversized requests before contacting a provider", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      new LLMProvider(config, new RequestGuard()).structured(
        "system",
        "large ".repeat(6000),
        graphSchema,
      ),
    ).rejects.toThrow("too large");
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe("memory-only request pacing", () => {
  it("allows editing an incomplete custom endpoint without throwing", () => {
    expect(() =>
      new RequestGuard().availability({
        ...config,
        provider: "compatible",
        endpoint: "https://",
      }),
    ).not.toThrow();
  });
  it("recognizes minute/day quota header aliases", () => {
    const guard = new RequestGuard(() => 0);
    const c = {
      ...config,
      provider: "cerebras" as const,
      model: "qwen-3.8-27b",
    };
    guard.observe(
      c,
      new Response("", {
        headers: {
          "x-ratelimit-remaining-tokens-minute": "100",
          "x-ratelimit-reset-tokens-minute": "45.5",
          "x-ratelimit-remaining-requests-day": "0",
          "x-ratelimit-reset-requests-day": "3600",
        },
      }),
    );
    expect(guard.availability(c, 9500).retryAt).toBe(3600000);
    expect(guard.availability(c).blocked).toBe(true);
  });
  it("reserves input plus output and shares the minute budget across keys and models", () => {
    let now = 0;
    const guard = new RequestGuard(() => now);
    guard.begin(config, 5500).finish();
    now = 3000;
    const changed = {
      ...config,
      key: "ANOTHER-KEY",
      model: "openai/gpt-oss-120b",
    };
    expect(() => guard.begin(changed, 5500)).toThrow("wait");
    now = 60000;
    guard.begin(changed, 5500).finish();
  });
  it("reconciles actual usage, enabling a small discovery followed by extraction", () => {
    let now = 0;
    const guard = new RequestGuard(() => now);
    guard.begin(config, 2500).finish(250);
    now = 3000;
    expect(guard.availability(config, 5500).blocked).toBe(false);
    guard.begin(config, 5500).finish(700);
    now = 6000;
    expect(guard.availability(config, 5500).blocked).toBe(true);
  });
  it("rejects concurrent requests and releases a ticket only once", () => {
    const guard = new RequestGuard();
    const ticket = guard.begin(config, 1000);
    expect(() =>
      guard.begin({ ...config, model: "openai/gpt-oss-120b" }, 1000),
    ).toThrow("already running");
    ticket.finish(100);
    ticket.finish(5000);
    expect(guard.availability(config).reason).not.toContain("already running");
  });
  it("spaces Cerebras calls and protects its per-minute request count", () => {
    let now = 0;
    const guard = new RequestGuard(() => now),
      c = { ...config, provider: "cerebras" as const, model: "qwen-3.8-27b" };
    for (let i = 0; i < 4; i++) {
      now = i * 15000;
      guard.begin(c, 0).finish(0);
    }
    now = 59999;
    expect(guard.availability(c).blocked).toBe(true);
    now = 60000;
    expect(guard.availability(c).blocked).toBe(false);
  });
  it("protects rolling daily request and token budgets within the tab", () => {
    let now = 0;
    const guard = new RequestGuard(() => now);
    for (let i = 0; i < 80; i++) {
      now = i * 60000;
      guard.begin(config, 0).finish(0);
    }
    now += 60000;
    expect(guard.availability(config).retryAt).toBe(86400000);
    now = 86400000;
    expect(guard.availability(config).blocked).toBe(false);
    guard.reset();
    now = 0;
    for (let i = 0; i < 18; i++) {
      now = i * 60000;
      guard.begin(config, 5500).finish(5500);
    }
    now += 60000;
    expect(guard.availability(config, 5500).retryAt).toBe(86400000);
  });
  it("blocks rejected keys across model/list calls until the key changes", async () => {
    let now = 0;
    const guard = new RequestGuard(() => now),
      fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(new LLMProvider(config, guard).listModels()).rejects.toThrow(
      "denied",
    );
    now = 60000;
    await expect(
      new LLMProvider(
        { ...config, model: "openai/gpt-oss-120b" },
        guard,
      ).structured("system", "text", graphSchema),
    ).rejects.toThrow("different API key");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      guard.availability({ ...config, key: "CORRECTED-KEY" }).blocked,
    ).toBe(false);
  });
  it("treats forbidden model access separately from a globally invalid key", () => {
    let now = 0;
    const guard = new RequestGuard(() => now);
    guard.observe(config, new Response("", { status: 403 }));
    now = 60000;
    expect(guard.availability(config).blocked).toBe(true);
    expect(
      guard.availability({ ...config, model: "openai/gpt-oss-120b" }).blocked,
    ).toBe(false);
  });
  it("honors Retry-After dates and conservative quota cooldowns without retrying", async () => {
    let now = Date.UTC(2026, 9, 2);
    const guard = new RequestGuard(() => now),
      fetch = vi.fn().mockResolvedValue(
        new Response("", {
          status: 429,
          headers: { "Retry-After": new Date(now + 120000).toUTCString() },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      new LLMProvider(config, guard).structured("system", "text", graphSchema),
    ).rejects.toThrow("quota");
    expect(
      guard.availability({
        ...config,
        key: "DIFFERENT",
        model: "openai/gpt-oss-120b",
      }).retryAt,
    ).toBe(now + 120000);
    await expect(new LLMProvider(config, guard).listModels()).rejects.toThrow(
      "wait",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 120000;
    expect(guard.availability(config).blocked).toBe(false);
  });
  it("observes remaining token/request headers and compound reset durations", () => {
    let now = 0;
    const guard = new RequestGuard(() => now);
    guard.observe(
      config,
      new Response("", {
        headers: {
          "x-ratelimit-remaining-tokens": "400",
          "x-ratelimit-reset-tokens": "1m2.5s",
        },
      }),
    );
    expect(guard.availability(config, 500).retryAt).toBe(62500);
    expect(guard.availability(config, 300).blocked).toBe(false);
    guard.observe(
      config,
      new Response("", {
        headers: {
          "x-ratelimit-remaining-requests": "0",
          "x-ratelimit-reset-requests": "2h",
        },
      }),
    );
    expect(guard.availability(config).retryAt).toBe(7200000);
    now = 7200000;
    expect(guard.availability(config, 5500).blocked).toBe(false);
  });
});
it("removes legacy remembered keys without reading values or disturbing other storage", () => {
  const store = {
    "evidence-atlas-key:groq": "LEGACY-SECRET",
    theme: "dark",
    removeItem: vi.fn(),
    getItem: vi.fn(),
    setItem: vi.fn(),
  };
  vi.stubGlobal("localStorage", store);
  clearLegacyKeys();
  expect(store.removeItem).toHaveBeenCalledWith("evidence-atlas-key:groq");
  expect(store.removeItem).toHaveBeenCalledTimes(1);
  expect(store.getItem).not.toHaveBeenCalled();
  expect(store.setItem).not.toHaveBeenCalled();
});
it("paces the fully serialized request before reserving quota or starting the network call", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reserved = 0;
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    expect(reserved).toBe(
      estimatedInputTokens(body) + outputBudget(config, conceptSchema),
    );
    return new Response(
      JSON.stringify({
        choices: [
          { finish_reason: "stop", message: { content: '{"concepts":[]}' } },
        ],
        usage: { total_tokens: 100 },
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const provider = new LLMProvider(
    config,
    new RequestGuard(),
    async (tokens) => {
      reserved = tokens;
      await gate;
    },
  );
  const pending = provider.structured("Find concepts", "Alpha", conceptSchema);
  await Promise.resolve();
  expect(fetcher).not.toHaveBeenCalled();
  release();
  await expect(pending).resolves.toEqual({ concepts: [] });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
