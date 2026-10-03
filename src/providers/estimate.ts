import type { Concept, ExtractionOptions, ResearchDocument } from "../types";
import { providers, type ProviderConfig } from "./client";
import { coverageBatches } from "./coverage";
import {
  outputBudget,
  requestPolicy,
  safeOptions,
  type RequestPolicy,
} from "./limits";
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
  observedPolicy?: RequestPolicy | null,
): RunEstimate {
  options = safeOptions(config, options);
  const batches = coverageBatches(doc, options.contextTokens),
    policy = observedPolicy ?? requestPolicy(config);
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
  const pace = (tokens: number, slow = false) =>
    Math.max(
      calls * latency * (slow ? 2.5 : 1),
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
  const quotaDays = windows(policy?.inputOnly ? inputTokens : tokenCeiling);
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
      pace(policy?.inputOnly ? inputTokens : inputTokens + outputTokens) +
      (windows(policy?.inputOnly ? inputTokens : inputTokens + outputTokens) -
        1) *
        86400000,
    durationCeilingMs:
      pace(policy?.inputOnly ? inputTokens : tokenCeiling, true) +
      (quotaDays - 1) * 86400000,
    quotaDays,
    requestsPerMinute: policy?.requestsPerMinute ?? null,
    tokensPerMinute: policy?.tokensPerMinute ?? null,
  };
}

export function paidAlternatives(
  doc: ResearchDocument,
  concepts: Concept[],
  options: ExtractionOptions,
  current?: ProviderConfig,
) {
  return (
    [
      {
        provider: "openai",
        model: providers.openai.models[0],
        endpoint: "https://api.openai.com/v1",
      },
      {
        provider: "gemini",
        model: providers.gemini.models[0],
        endpoint: "https://generativelanguage.googleapis.com/v1beta",
      },
    ] as const
  ).map((p) => {
    const config: ProviderConfig = {
      ...p,
      key: "",
      billing: "standard",
      capacity:
        current?.provider === p.provider &&
        current.billing !== "free" &&
        current.model === p.model
          ? current.capacity
          : undefined,
    };
    return {
      config,
      estimate: estimateRun(doc, concepts, config, {
        ...options,
        contextTokens: 6000,
      }),
    };
  });
}
