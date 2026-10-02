import type { Concept, ExtractionOptions, ResearchDocument } from "../types";
import type { ProviderConfig } from "./client";
import { coverageBatches } from "./coverage";
import { outputBudget, requestPolicy } from "./limits";
import { conceptSchema, graphSchema } from "./schema";
import { formatContext, occurrences } from "../retrieval/context";
import { priceFor, tokenCost } from "./usage";
export interface RunEstimate {
  sections: number;
  discoveryCalls: number;
  relationshipCalls: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  tokenCeiling: number;
  costUSD: number | null;
  costCeilingUSD: number | null;
  durationMs: number;
  durationCeilingMs: number;
  quotaDays: number;
  requestsPerMinute: number | null;
  tokensPerMinute: number | null;
}
export function estimateRun(
  doc: ResearchDocument,
  concepts: Concept[],
  config: ProviderConfig,
  options: ExtractionOptions,
  discoveryComplete = false,
  completedDiscovery: number[] = [],
  completedRelationships: number[] = [],
  free = false,
  observedLatencyMs?: number,
): RunEstimate {
  const batches = coverageBatches(doc, options.contextTokens),
    policy = requestPolicy(config);
  const discovery = batches.filter(
    (_, i) => !discoveryComplete && !completedDiscovery.includes(i),
  );
  const relations = batches.filter(
    (b, i) =>
      !completedRelationships.includes(i) &&
      (!discoveryComplete ||
        concepts.filter(
          (c) =>
            c.selected &&
            b.some((p) =>
              [c.label, ...c.aliases].some(
                (t) => occurrences(p.text, t).length,
              ),
            ),
        ).length >= 2),
  );
  const input = (batch: (typeof batches)[number], relationship: boolean) =>
    Math.min(
      policy?.inputTokens ?? 25000,
      Math.ceil(new TextEncoder().encode(formatContext(batch)).length / 3) +
        (relationship ? 1800 : 900),
    );
  const inputTokens =
    discovery.reduce((n, b) => n + input(b, false), 0) +
    relations.reduce((n, b) => n + input(b, true), 0);
  const discoveryOutput = outputBudget(config, conceptSchema),
    relationOutput = outputBudget(config, graphSchema);
  const outputTokens =
    discovery.length * Math.min(600, discoveryOutput) +
    relations.length * Math.min(1100, relationOutput);
  const tokenCeiling =
    inputTokens +
    discovery.length * discoveryOutput +
    relations.length * relationOutput;
  const calls = discovery.length + relations.length;
  const latency =
    observedLatencyMs ??
    (config.provider === "groq"
      ? 2000
      : config.provider === "gemini"
        ? 6000
        : 10000);
  const pace = (tokens: number) =>
    Math.max(
      calls * latency,
      policy ? calls * policy.spacingMs : 0,
      policy ? (Math.max(0, calls - 1) / policy.requestsPerMinute) * 60000 : 0,
      policy
        ? (Math.max(0, tokens - (policy.tokensPerMinute || 1)) /
            policy.tokensPerMinute) *
            60000
        : 0,
    );
  const windows = (tokens: number) =>
    policy
      ? Math.max(
          1,
          Math.ceil(calls / policy.requestsPerDay),
          Math.ceil(tokens / policy.tokensPerDay),
        )
      : 1;
  const quotaDays = windows(tokenCeiling);
  const usage = {
    inputTokens,
    outputTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: inputTokens + outputTokens,
  };
  const price = priceFor(config);
  return {
    sections: batches.length,
    discoveryCalls: discovery.length,
    relationshipCalls: relations.length,
    calls,
    inputTokens,
    outputTokens,
    tokenCeiling,
    costUSD: tokenCost(usage, price, free ? "free" : "standard"),
    costCeilingUSD: tokenCost(
      {
        ...usage,
        outputTokens: tokenCeiling - inputTokens,
        totalTokens: tokenCeiling,
      },
      price,
      free ? "free" : "standard",
    ),
    durationMs:
      pace(inputTokens + outputTokens) +
      (windows(inputTokens + outputTokens) - 1) * 86400000,
    durationCeilingMs: pace(tokenCeiling) + (quotaDays - 1) * 86400000,
    quotaDays,
    requestsPerMinute: policy?.requestsPerMinute ?? null,
    tokensPerMinute: policy?.tokensPerMinute ?? null,
  };
}
