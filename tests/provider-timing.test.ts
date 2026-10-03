import { describe, it, expect, vi, afterEach } from "vitest";
import { capacityProfile, safeCapacity } from "../src/providers/capacity";
import { estimateRun, paidAlternatives } from "../src/providers/estimate";
import { RequestGuard, requestPolicy } from "../src/providers/limits";
import { LLMProvider, type ProviderConfig } from "../src/providers/client";
import { graphSchema } from "../src/providers/schema";
import { defaults } from "../src/types";
import { documentFromPages } from "../src/documents/text";
import { safeDraft, type Draft } from "../src/storage/drafts";
const openai: ProviderConfig = {
  provider: "openai",
  model: "gpt-6-luna",
  endpoint: "https://api.openai.com/v1",
  key: "DUMMY",
};
const gemini: ProviderConfig = {
  ...openai,
  provider: "gemini",
  model: "gemini-2.5-flash",
};
const large = () =>
  documentFromPages(
    "large.txt",
    Array.from({ length: 100 }, () => "Alpha relates to Beta. ".repeat(100)),
  );
afterEach(() => vi.unstubAllGlobals());
describe("provider capacity and timing", () => {
  it("uses verified model-specific Tier 1 rates with headroom, and labels Gemini assumptions", () => {
    expect(capacityProfile(openai)).toMatchObject({
      rpm: 500,
      tpm: 500000,
      rpd: 0,
    });
    expect(requestPolicy(openai)).toMatchObject({
      requestsPerMinute: 400,
      tokensPerMinute: 400000,
      requestsPerDay: 1e15,
    });
    expect(
      requestPolicy({ ...openai, model: "gpt-4.1" })?.tokensPerMinute,
    ).toBe(24000);
    expect(capacityProfile(gemini)?.label).toContain("planning example");
    expect(capacityProfile({ ...gemini, billing: "free" })?.label).toContain(
      "actual account quotas unknown",
    );
    expect(requestPolicy(gemini)?.inputOnly).toBe(true);
  });
  it("re-batches the full corpus for paid providers instead of inheriting Groq's small context", () => {
    const doc = large();
    const groq: ProviderConfig = {
      ...openai,
      provider: "groq",
      model: "openai/gpt-oss-20b",
    };
    const slow = estimateRun(doc, [], groq, defaults);
    const alternatives = paidAlternatives(doc, [], {
      ...defaults,
      contextTokens: 1000,
    });
    expect(slow.quotaDays).toBeGreaterThan(1);
    for (const { estimate } of alternatives) {
      expect(estimate.calls).toBeLessThan(slow.calls);
      expect(estimate.durationCeilingMs).toBeLessThan(slow.durationMs);
      expect(estimate.quotaDays).toBe(1);
      expect(estimate.costUSD).toBeGreaterThan(0);
      expect(estimate.durationCeilingMs).toBeGreaterThan(estimate.durationMs);
    }
  });
  it("honors dashboard limits in both estimates and actual request scheduling", () => {
    const config = { ...openai, capacity: { rpm: 10, tpm: 100000, rpd: 10 } };
    expect(capacityProfile(config)?.label).toBe("Your dashboard limits");
    expect(
      estimateRun(large(), [], config, defaults).quotaDays,
    ).toBeGreaterThan(1);
    let now = 0;
    const guard = new RequestGuard(() => now);
    guard.begin(config, 100).finish(100);
    now = 7499;
    expect(guard.availability(config).blocked).toBe(true);
    now = 7500;
    expect(guard.availability(config).blocked).toBe(false);
    expect(
      paidAlternatives(large(), [], defaults, config)[0].config.capacity,
    ).toEqual(config.capacity);
  });
  it("never imports public capacity into unknown/private providers and honors explicit Groq dashboard limits", () => {
    expect(capacityProfile({ ...openai, model: "unknown" })).toBeNull();
    expect(
      capacityProfile({
        ...openai,
        provider: "compatible",
        endpoint: "https://private.test/v1",
        capacity: { rpm: 5000, tpm: 1e6, rpd: 0 },
      }),
    ).toBeNull();
    expect(
      requestPolicy({
        ...openai,
        provider: "groq",
        model: "openai/gpt-oss-20b",
        capacity: { rpm: 5000, tpm: 1e6, rpd: 0 },
      })?.tokensPerMinute,
    ).toBe(800000);
  });
  it("adapts to lower response and project ceilings without repeated oversized requests", () => {
    const guard = new RequestGuard(() => 0);
    guard.observe(
      openai,
      new Response("{}", {
        headers: {
          "x-ratelimit-limit-requests": "10",
          "x-ratelimit-limit-tokens": "50000",
          "x-ratelimit-limit-project-tokens": "20000",
        },
      }),
    );
    expect(guard.effectivePolicy(openai)).toMatchObject({
      requestsPerMinute: 8,
      tokensPerMinute: 16000,
    });
    expect(guard.availability(openai, 16001)).toMatchObject({
      blocked: true,
      retryAt: 0,
    });
    expect(() => guard.begin(openai, 16001)).toThrow("configured token limit");
    const e = estimateRun(
      large(),
      [],
      openai,
      defaults,
      false,
      [],
      [],
      false,
      undefined,
      guard.effectivePolicy(openai),
    );
    expect(e.tokensPerMinute).toBe(16000);
  });
  it("waits for shared project token resets even when model tokens remain", () => {
    const guard = new RequestGuard(() => 0);
    guard.observe(
      openai,
      new Response("{}", {
        headers: {
          "x-ratelimit-remaining-tokens": "20000",
          "x-ratelimit-remaining-project-tokens": "0",
          "x-ratelimit-reset-project-tokens": "45s",
        },
      }),
    );
    expect(guard.availability(openai, 100).retryAt).toBe(45000);
  });
  it("treats ordinary remaining-request headers as minute windows, preserving daily headers", () => {
    const guard = new RequestGuard(() => 0);
    guard.observe(
      openai,
      new Response("{}", {
        headers: { "x-ratelimit-remaining-requests": "0" },
      }),
    );
    expect(guard.availability(openai).retryAt).toBe(60000);
  });
  it("keeps Gemini output in usage/cost while reserving only input for its TPM quota", async () => {
    const guard = new RequestGuard(() => 0);
    const reserve = vi.fn(async (_tokens: number) => {}),
      events: any[] = [];
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: '{"nodes":[],"edges":[]}' }] },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 500,
              candidatesTokenCount: 9000,
              totalTokenCount: 9500,
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const config = { ...gemini, capacity: { rpm: 60, tpm: 5000, rpd: 0 } };
    await new LLMProvider(config, guard, reserve, (e) =>
      events.push(e),
    ).structured("system", "paper", graphSchema);
    expect(fetch).toHaveBeenCalledOnce();
    expect(reserve.mock.calls[0][0]).toBeLessThan(4000);
    expect(events[0].usage.totalTokens).toBe(9500);
    expect(events[0].reservedTokens).toBeGreaterThan(10000);
    expect(guard.availability(config, 3500).retryAt).toBe(1250); // request spacing only; 500 input + 3500 fits.
  });
  it("sanitizes saved quota fields and never persists nested keys", () => {
    const capacity = { rpm: 500, tpm: 500000, rpd: 0, key: "SECRET" };
    expect(safeCapacity(capacity)).toEqual({
      rpm: 500,
      tpm: 500000,
      rpd: 0,
    });
    expect(safeCapacity({ rpm: 5, tpm: 20000, rpd: 0.5 })).toBeUndefined();
    expect(safeCapacity({ rpm: NaN, tpm: 1, rpd: 0 })).toBeUndefined();
    const draft: Draft = {
      id: "d",
      name: "draft",
      updatedAt: "",
      status: "ongoing",
      step: 0,
      focus: "",
      keywords: "",
      document: null,
      concepts: [],
      options: defaults,
      provider: { ...openai, capacity },
      analysis: null,
      discoverySignature: "",
    };
    expect(JSON.stringify(safeDraft(draft))).not.toContain("SECRET");
    expect(JSON.stringify(safeDraft(draft))).not.toContain("DUMMY");
  });
});
