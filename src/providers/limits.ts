import type { ProviderConfig } from "./client";
import type { ExtractionOptions } from "../types";

export interface RequestPolicy {
  contextTokens: number;
  maxNodes: number;
  maxEdges: number;
  inputTokens: number;
  outputTokens: number;
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerDay: number;
  tokensPerDay: number;
  spacingMs: number;
}
const groq: RequestPolicy = {
  contextTokens: 1000,
  maxNodes: 150,
  maxEdges: 500,
  inputTokens: 3000,
  outputTokens: 2600,
  requestsPerMinute: 20,
  tokensPerMinute: 6000,
  requestsPerDay: 80,
  tokensPerDay: 100000,
  spacingMs: 2500,
};
const cerebras: RequestPolicy = {
  contextTokens: 2000,
  maxNodes: 150,
  maxEdges: 500,
  inputTokens: 4500,
  outputTokens: 5000,
  requestsPerMinute: 4,
  tokensPerMinute: 24000,
  requestsPerDay: 100,
  tokensPerDay: 200000,
  spacingMs: 15000,
};
const known = {
  groq: new Set([
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
  ]),
  cerebras: new Set(["qwen-3.8-27b", "gpt-oss-120b"]),
};
export function freeProvider(
  config: ProviderConfig,
): "groq" | "cerebras" | null {
  if (config.provider === "groq" || config.provider === "cerebras")
    return config.provider;
  if (config.provider === "compatible") {
    try {
      const host = new URL(config.endpoint).hostname;
      if (host === "api.groq.com") return "groq";
      if (host === "api.cerebras.ai") return "cerebras";
    } catch {
      /* Endpoint validation reports this before any request. */
    }
  }
  return null;
}
export function requestPolicy(config: ProviderConfig): RequestPolicy | null {
  const provider = freeProvider(config);
  if (!provider) return null;
  const base = provider === "groq" ? groq : cerebras;
  // Unlisted model capabilities/quotas are unknown: keep a smaller starter budget.
  return known[provider].has(config.model)
    ? base
    : {
        ...base,
        contextTokens: 500,
        maxNodes: 150,
        maxEdges: 500,
        inputTokens: 2000,
        outputTokens: 1800,
      };
}
export function reasoningEffort(config: ProviderConfig): "low" | undefined {
  const provider = freeProvider(config);
  return provider && known[provider].has(config.model) ? "low" : undefined;
}
export function safeOptions(
  config: ProviderConfig,
  options: ExtractionOptions,
): ExtractionOptions {
  const policy = requestPolicy(config);
  if (!policy) return options;
  return {
    ...options,
    contextTokens: Math.min(options.contextTokens, policy.contextTokens),
    maxNodes: Math.min(options.maxNodes, policy.maxNodes),
    maxEdges: Math.min(options.maxEdges, policy.maxEdges),
  };
}
export function estimatedInputTokens(body: unknown): number {
  // Include system instructions, reviewed concepts, schema, and request metadata.
  // This remains an estimate: provider tokenizers and account quotas can differ.
  return (
    Math.ceil(new TextEncoder().encode(JSON.stringify(body)).length / 3) + 128
  );
}
export function outputBudget(config: ProviderConfig, schema: object): number {
  const policy = requestPolicy(config);
  if (!policy) return config.provider === "gemini" ? 10000 : 7000;
  const discovery =
    "properties" in schema &&
    schema.properties &&
    typeof schema.properties === "object" &&
    "concepts" in schema.properties;
  return discovery ? Math.min(1200, policy.outputTokens) : policy.outputTokens;
}

interface RecordEntry {
  at: number;
  tokens: number;
}
interface State {
  records: RecordEntry[];
  inFlight: boolean;
  lastRequest: number;
  cooldown: number;
  remainingTokens?: { value: number; until: number };
  remainingRequests?: { value: number; until: number };
  invalidKeys: Set<string>;
  deniedModels: Set<string>;
}
export interface Availability {
  blocked: boolean;
  reason: string;
  retryAt: number;
}
const minute = 60000,
  day = 86400000;
function resetTime(value: string | null, now: number): number | null {
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) return now + Number(value) * 1000;
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/g)];
  if (parts.length && parts.map((p) => p[0]).join("") === value) {
    const units: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: minute,
      h: 3600000,
      d: day,
    };
    return now + parts.reduce((sum, p) => sum + Number(p[1]) * units[p[2]], 0);
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(now, date) : null;
}
const finiteHeader = (value: string | null) =>
  value !== null &&
  value.trim() !== "" &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0
    ? Number(value)
    : null;

export class RequestGuard {
  private states = new Map<string, State>();
  private listeners = new Set<() => void>();
  constructor(private now = () => Date.now()) {}
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
  reset() {
    this.states.clear();
    this.emit();
  }
  private state(config: ProviderConfig): State {
    const free = freeProvider(config);
    const scope =
      free ||
      (config.provider === "compatible"
        ? config.endpoint.trim().replace(/\/$/, "")
        : config.provider);
    let state = this.states.get(scope);
    if (!state) {
      state = {
        records: [],
        inFlight: false,
        lastRequest: -Infinity,
        cooldown: 0,
        invalidKeys: new Set(),
        deniedModels: new Set(),
      };
      this.states.set(scope, state);
    }
    state.records = state.records.filter((r) => r.at > this.now() - day);
    return state;
  }
  availability(config: ProviderConfig, tokens = 0): Availability {
    const state = this.state(config),
      now = this.now(),
      policy = requestPolicy(config);
    if (state.invalidKeys.has(config.key))
      return {
        blocked: true,
        reason:
          "This key was rejected. Enter a different API key before trying again.",
        retryAt: 0,
      };
    if (state.deniedModels.has(config.key + "\n" + config.model))
      return {
        blocked: true,
        reason:
          "Access was denied. Change the key or model before trying again.",
        retryAt: 0,
      };
    if (state.inFlight)
      return {
        blocked: true,
        reason: "A request to this provider is already running.",
        retryAt: 0,
      };
    let until = state.cooldown;
    if (policy && state.records.length)
      until = Math.max(until, state.lastRequest + policy.spacingMs);
    if (policy) {
      const recent = state.records.filter((r) => r.at > now - minute);
      if (recent.length >= policy.requestsPerMinute)
        until = Math.max(
          until,
          recent[recent.length - policy.requestsPerMinute].at + minute,
        );
      if (state.records.length >= policy.requestsPerDay)
        until = Math.max(
          until,
          state.records[state.records.length - policy.requestsPerDay].at + day,
        );
      for (const [records, budget, window] of [
        [recent, policy.tokensPerMinute, minute],
        [state.records, policy.tokensPerDay, day],
      ] as const) {
        let used = records.reduce((sum, r) => sum + r.tokens, 0);
        for (const record of records) {
          if (used + tokens <= budget) break;
          used -= record.tokens;
          until = Math.max(until, record.at + window);
        }
      }
    }
    if (
      state.remainingTokens &&
      state.remainingTokens.until > now &&
      state.remainingTokens.value < tokens
    )
      until = Math.max(until, state.remainingTokens.until);
    if (
      state.remainingRequests &&
      state.remainingRequests.until > now &&
      state.remainingRequests.value < 1
    )
      until = Math.max(until, state.remainingRequests.until);
    const blocked = until > now;
    return {
      blocked,
      reason: blocked
        ? `Please wait ${Math.ceil((until - now) / 1000)} seconds before another request.`
        : "",
      retryAt: blocked ? until : 0,
    };
  }
  begin(config: ProviderConfig, tokens: number) {
    const policy = requestPolicy(config);
    if (policy && tokens > policy.tokensPerMinute)
      throw new Error(
        "This request exceeds the starter token budget. Reduce the context or graph size.",
      );
    const status = this.availability(config, tokens);
    if (status.blocked) throw new Error(status.reason);
    const state = this.state(config),
      record = { at: this.now(), tokens };
    state.records.push(record);
    state.lastRequest = record.at;
    state.inFlight = true;
    this.emit();
    let finished = false;
    return {
      finish: (actualTokens?: number) => {
        if (finished) return;
        finished = true;
        if (
          typeof actualTokens === "number" &&
          Number.isFinite(actualTokens) &&
          actualTokens >= 0
        )
          record.tokens = actualTokens;
        state.inFlight = false;
        this.emit();
      },
    };
  }
  observe(config: ProviderConfig, response: Response) {
    const state = this.state(config),
      now = this.now();
    if (response.status === 401) state.invalidKeys.add(config.key);
    if (response.status === 403)
      state.deniedModels.add(config.key + "\n" + config.model);
    if (response.status === 429)
      state.cooldown = Math.max(
        state.cooldown,
        now + minute,
        resetTime(response.headers.get("retry-after"), now) || 0,
      );
    const remainingTokens = finiteHeader(
      response.headers.get("x-ratelimit-remaining-tokens") ??
        response.headers.get("x-ratelimit-remaining-tokens-minute"),
    );
    const remainingRequests = finiteHeader(
      response.headers.get("x-ratelimit-remaining-requests") ??
        response.headers.get("x-ratelimit-remaining-requests-day"),
    );
    if (remainingTokens !== null)
      state.remainingTokens = {
        value: remainingTokens,
        until:
          resetTime(
            response.headers.get("x-ratelimit-reset-tokens") ??
              response.headers.get("x-ratelimit-reset-tokens-minute"),
            now,
          ) || now + minute,
      };
    if (remainingRequests !== null)
      state.remainingRequests = {
        value: remainingRequests,
        until:
          resetTime(
            response.headers.get("x-ratelimit-reset-requests") ??
              response.headers.get("x-ratelimit-reset-requests-day"),
            now,
          ) || now + day,
      };
    this.emit();
  }
}
export const requestGuard = new RequestGuard();
