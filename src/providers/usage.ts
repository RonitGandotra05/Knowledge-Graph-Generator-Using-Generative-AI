import type { ProviderConfig } from "./client";
import type { UsageTotals } from "../types";
export const pricingDate = "2026-10-03";
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}
export interface UsageEvent {
  usage: TokenUsage | null;
  reservedTokens: number;
  durationMs: number;
  status: number;
  config: Omit<ProviderConfig, "key">;
}
export interface Price {
  input: number;
  output: number;
  cached: number;
  write?: number;
  source: string;
}
const openai = "https://developers.openai.com/api/docs/pricing";
const groq = "https://console.groq.com/docs/models";
const claude = "https://platform.claude.com/docs/en/about-claude/pricing";
const gemini = "https://ai.google.dev/gemini-api/docs/pricing";
// USD / million tokens, standard synchronous text requests. Exact known models
// only; unknown/private endpoints never inherit someone else's pricing.
const prices: Record<string, Price> = {
  "openai:gpt-4.1-mini": {
    input: 0.4,
    output: 1.6,
    cached: 0.1,
    source: openai,
  },
  "openai:gpt-4.1": { input: 2, output: 8, cached: 0.5, source: openai },
  "openai:gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
    cached: 0.075,
    source: openai,
  },
  "groq:openai/gpt-oss-20b": {
    input: 0.075,
    output: 0.3,
    cached: 0.037,
    source: groq,
  },
  "groq:openai/gpt-oss-120b": {
    input: 0.15,
    output: 0.6,
    cached: 0.075,
    source: groq,
  },
  "groq:qwen/qwen3.8-27b": { input: 0.8, output: 4, cached: 0.8, source: groq },
  "anthropic:claude-sonnet-4-5": {
    input: 3,
    output: 15,
    cached: 0.3,
    write: 3.75,
    source: claude,
  },
  "anthropic:claude-haiku-4-5": {
    input: 1,
    output: 5,
    cached: 0.1,
    write: 1.25,
    source: claude,
  },
  "gemini:gemini-2.5-flash": {
    input: 0.3,
    output: 2.5,
    cached: 0.03,
    source: gemini,
  },
  "gemini:gemini-2.5-pro": {
    input: 1.25,
    output: 10,
    cached: 0.125,
    source: gemini,
  },
};
export function priceFor(config: Omit<ProviderConfig, "key">): Price | null {
  let provider = config.provider;
  if (provider === "compatible") {
    try {
      const url = new URL(config.endpoint),
        path = url.pathname.replace(/\/$/, "");
      if (url.origin === "https://api.groq.com" && path === "/openai/v1")
        provider = "groq";
      else if (url.origin === "https://api.openai.com" && path === "/v1")
        provider = "openai";
      else return null;
    } catch {
      return null;
    }
  }
  return prices[`${provider}:${config.model}`] || null;
}
const n = (x: unknown) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null;
export function reportedUsage(
  provider: ProviderConfig["provider"],
  data: any,
): TokenUsage | null {
  let input,
    output,
    cached = 0,
    write = 0,
    total;
  if (provider === "gemini") {
    const u = data?.usageMetadata;
    input = n(u?.promptTokenCount);
    total = n(u?.totalTokenCount);
    cached = n(u?.cachedContentTokenCount) || 0;
    output =
      total !== null && input !== null
        ? Math.max(0, total - input)
        : n(u?.candidatesTokenCount);
    if (total === null && output !== null)
      output += n(u?.thoughtsTokenCount) || 0;
  } else if (provider === "anthropic") {
    const u = data?.usage;
    input = n(u?.input_tokens);
    output = n(u?.output_tokens);
    cached = n(u?.cache_read_input_tokens) || 0;
    write = n(u?.cache_creation_input_tokens) || 0;
    if (input !== null) input += cached + write;
  } else {
    const u = data?.usage;
    input = n(u?.prompt_tokens);
    output = n(u?.completion_tokens);
    total = n(u?.total_tokens);
    cached = n(u?.prompt_tokens_details?.cached_tokens) || 0;
  }
  if (
    input === null ||
    input === undefined ||
    output === null ||
    output === undefined
  )
    return null;
  cached = Math.min(input, cached);
  return {
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached,
    cacheWriteTokens: Math.min(input - cached, write),
    totalTokens: total ?? input + output,
  };
}
export function tokenCost(
  usage: TokenUsage,
  price: Price | null,
  billing: "standard" | "free" = "standard",
): number | null {
  if (billing === "free") return 0;
  if (!price) return null;
  return (
    ((usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens) *
      price.input +
      usage.cachedInputTokens * price.cached +
      usage.cacheWriteTokens * (price.write ?? price.input) +
      usage.outputTokens * price.output) /
    1_000_000
  );
}
export const emptyUsage = (): UsageTotals => ({
  calls: 0,
  reportedCalls: 0,
  unknownCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  unreportedTokenCeiling: 0,
  elapsedMs: 0,
  requestDurationMs: 0,
  estimatedCostUSD: 0,
  pricingDate,
  billing: "standard",
});
export function addUsage(totals: UsageTotals, event: UsageEvent): UsageTotals {
  const result = {
    ...totals,
    calls: totals.calls + 1,
    requestDurationMs: (totals.requestDurationMs || 0) + event.durationMs,
  };
  if (event.usage) {
    result.reportedCalls++;
    for (const key of [
      "inputTokens",
      "outputTokens",
      "cachedInputTokens",
      "cacheWriteTokens",
      "totalTokens",
    ] as const)
      result[key] += event.usage[key];
    const cost = tokenCost(
      event.usage,
      priceFor(event.config),
      event.config.billing ?? totals.billing,
    );
    result.estimatedCostUSD =
      cost === null || totals.estimatedCostUSD === null
        ? null
        : totals.estimatedCostUSD + cost;
  } else {
    result.unknownCalls++;
    result.unreportedTokenCeiling += event.reservedTokens;
    result.estimatedCostUSD = null;
  }
  return result;
}
// Whitelist persisted/imported accounting fields; never store raw responses or configuration.
export function safeUsage(value: UsageTotals): UsageTotals {
  const base = emptyUsage();
  for (const key of [
    "calls",
    "reportedCalls",
    "unknownCalls",
    "inputTokens",
    "outputTokens",
    "cachedInputTokens",
    "cacheWriteTokens",
    "totalTokens",
    "unreportedTokenCeiling",
    "elapsedMs",
    "requestDurationMs",
  ] as const)
    base[key] = n(value[key]) || 0;
  base.estimatedCostUSD =
    typeof value.estimatedCostUSD === "number" &&
    Number.isFinite(value.estimatedCostUSD) &&
    value.estimatedCostUSD >= 0
      ? value.estimatedCostUSD
      : null;
  base.billing = value.billing === "free" ? "free" : "standard";
  base.pricingDate =
    typeof value.pricingDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.pricingDate)
      ? value.pricingDate
      : pricingDate;
  return base;
}
export const money = (cost: number) =>
  cost === 0
    ? "$0.00"
    : cost < 0.01
      ? "$" + cost.toFixed(4)
      : "$" + cost.toFixed(2);
export function duration(ms: number): string {
  if (ms < 60000) return `${Math.max(1, Math.ceil(ms / 1000))} sec`;
  if (ms < 3600000) return `${Math.ceil(ms / 60000)} min`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)} hr`;
  return `${(ms / 86400000).toFixed(1)} days`;
}
