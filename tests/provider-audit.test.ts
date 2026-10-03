import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LLMProvider,
  providers,
  type ProviderConfig,
  type ProviderId,
} from "../src/providers/client";
import { RequestGuard, requestPolicy } from "../src/providers/limits";
import { capacityProfile } from "../src/providers/capacity";
import { priceFor, tokenCost } from "../src/providers/usage";
import { graphSchema } from "../src/providers/schema";
afterEach(() => vi.unstubAllGlobals());
const config = (
  provider: ProviderId,
  model = providers[provider].models[0],
): ProviderConfig => ({
  provider,
  model,
  endpoint: providers[provider].endpoint,
  key: "TEST-ONLY",
});
describe("October 2026 provider audit", () => {
  for (const provider of [
    "openai",
    "anthropic",
    "gemini",
    "groq",
    "cerebras",
  ] as const) {
    for (const model of providers[provider].models) {
      it(`${provider}/${model} constructs and parses its documented JSON protocol`, async () => {
        const result = { nodes: [], edges: [] };
        const fetch = vi.fn(
          async (_url: string, _init: RequestInit) =>
            new Response(
              JSON.stringify(
                provider === "anthropic"
                  ? {
                      stop_reason: "end_turn",
                      content: [
                        { type: "thinking", thinking: "ignored" },
                        { type: "text", text: JSON.stringify(result) },
                      ],
                    }
                  : provider === "gemini"
                    ? {
                        candidates: [
                          {
                            content: {
                              parts: [{ text: JSON.stringify(result) }],
                            },
                          },
                        ],
                      }
                    : {
                        choices: [
                          {
                            message: { content: JSON.stringify(result) },
                            finish_reason: "stop",
                          },
                        ],
                      },
              ),
            ),
        );
        vi.stubGlobal("fetch", fetch);
        await expect(
          new LLMProvider(
            config(provider, model),
            new RequestGuard(),
          ).structured("Extract", "Source excerpts", graphSchema),
        ).resolves.toEqual(result);
        const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
        if (provider === "anthropic") {
          expect(body.output_config.format).toEqual({
            type: "json_schema",
            schema: graphSchema,
          });
          expect(body.tool_choice).toBeUndefined();
          expect(body.tools).toBeUndefined();
        } else if (provider === "gemini") {
          expect(body.generationConfig.responseJsonSchema).toEqual(graphSchema);
          expect(fetch.mock.calls[0][0]).toContain(model + ":generateContent");
        } else {
          expect(body.response_format.json_schema).toMatchObject({
            strict: true,
            schema: graphSchema,
          });
          if (provider === "openai")
            expect(body.reasoning_effort).toBe(
              model === "gpt-6-luna" ? "none" : "low",
            );
        }
        if (provider !== "cerebras")
          expect(priceFor(config(provider, model))).not.toBeNull();
      });
    }
  }
  it("does not invent Gemini daily quotas or suppress free context", () => {
    const free = { ...config("gemini"), billing: "free" as const };
    expect(capacityProfile(free)).toMatchObject({
      rpd: 0,
      label: expect.stringContaining("actual account quotas unknown"),
    });
    expect(requestPolicy(free)?.contextTokens).toBe(6000);
    expect(requestPolicy(free)?.requestsPerDay).toBe(1e15);
  });
  it("reserves headroom against published Groq free quotas and uses trial caps for Cerebras", () => {
    expect(requestPolicy(config("groq"))).toMatchObject({
      requestsPerMinute: 24,
      tokensPerMinute: 6400,
      requestsPerDay: 800,
      tokensPerDay: 160000,
    });
    expect(capacityProfile(config("cerebras"))?.label).toContain("trial");
    expect(requestPolicy(config("cerebras"))?.requestsPerDay).toBe(1e15);
  });
  it("never reports free charges for paid-only, unknown or private models", () => {
    const usage = {
      inputTokens: 1000,
      outputTokens: 1000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 2000,
    };
    expect(tokenCost(usage, priceFor(config("gemini")), "free")).toBe(0);
    expect(
      tokenCost(
        usage,
        priceFor(config("gemini", "gemini-3.1-pro-preview")),
        "free",
      ),
    ).toBe(0.014);
    expect(tokenCost(usage, null, "free")).toBeNull();
    const privateConfig = {
      ...config("compatible"),
      endpoint: "https://api.groq.com/private/v1",
      capacity: { rpm: 1000, tpm: 1e6, rpd: 0 },
    };
    expect(priceFor(privateConfig)).toBeNull();
    expect(requestPolicy(privateConfig)).toBeNull();
    expect(capacityProfile(privateConfig)).toBeNull();
  });
});
