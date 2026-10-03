import type { ProviderConfig } from "./client";

// Dashboard quotas are non-secret. Zero daily limits mean no configured daily cap.
export interface RateCapacity {
  rpm: number;
  tpm: number;
  rpd: number;
}
export function safeCapacity(value: unknown): RateCapacity | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as Record<string, unknown>;
  if (
    ![v.rpm, v.tpm, v.rpd].every(
      (n) => typeof n === "number" && Number.isInteger(n),
    )
  )
    return;
  if ((v.rpm as number) < 1 || (v.tpm as number) < 1 || (v.rpd as number) < 0)
    return;
  return {
    rpm: Math.min(100000, Math.floor(v.rpm as number)),
    tpm: Math.min(1e9, Math.floor(v.tpm as number)),
    rpd: Math.min(1e9, Math.floor(v.rpd as number)),
  };
}
export interface CapacityProfile extends RateCapacity {
  label: string;
  source: string;
  inputOnly: boolean;
}
export function capacityProfile(
  config: ProviderConfig,
): CapacityProfile | null {
  let provider = config.provider;
  if (provider === "compatible") {
    try {
      const url = new URL(config.endpoint),
        path = url.pathname.replace(/\/$/, "");
      if (url.origin === "https://api.groq.com" && path === "/openai/v1")
        provider = "groq";
      else if (url.origin === "https://api.cerebras.ai" && path === "/v1")
        provider = "cerebras";
      else return null;
    } catch {
      return null;
    }
  }
  // Dedicated providers use fixed official endpoints. Private compatible endpoints
  // must never inherit a public model's account limits merely from its name.
  if (!["openai", "gemini", "anthropic", "groq", "cerebras"].includes(provider))
    return null;
  const source =
    provider === "openai"
      ? "https://developers.openai.com/api/docs/guides/rate-limits"
      : provider === "anthropic"
        ? "https://platform.claude.com/docs/en/api/rate-limits"
        : provider === "groq"
          ? "https://console.groq.com/docs/rate-limits"
          : provider === "cerebras"
            ? "https://inference-docs.cerebras.ai/support/rate-limits"
            : "https://ai.google.dev/gemini-api/docs/rate-limits";
  const custom = safeCapacity(config.capacity);
  if (custom)
    return {
      ...custom,
      label: "Your dashboard limits",
      source,
      inputOnly: provider === "gemini",
    };
  if (provider === "groq") {
    if (
      ![
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
        "qwen/qwen3.8-27b",
      ].includes(config.model)
    )
      return null;
    return {
      rpm: 30,
      tpm: 8000,
      rpd: 1000,
      label: "Published Groq free-tier baseline · verify organization limits",
      source,
      inputOnly: false,
    };
  }
  if (provider === "cerebras") {
    if (!["qwen-3.8-27b", "gpt-oss-120b"].includes(config.model)) return null;
    return {
      rpm: 5,
      tpm: 30000,
      rpd: 0,
      label: "Published Cerebras trial baseline · $5 credit expires in 30 days",
      source,
      inputOnly: false,
    };
  }
  if (provider === "openai") {
    if (
      ![
        "gpt-6-luna",
        "gpt-6.1-sol",
        "gpt-6-astra",
        "gpt-4.1-mini",
        "gpt-4o-mini",
        "gpt-4.1",
      ].includes(config.model)
    )
      return null;
    return {
      rpm: 500,
      tpm: /^gpt-6/.test(config.model)
        ? 500000
        : config.model === "gpt-4.1"
          ? 30000
          : 200000,
      rpd:
        /^gpt-6/.test(config.model) || config.model === "gpt-4.1" ? 0 : 10000,
      label: "Published OpenAI Tier 1 · verify your project",
      source: `https://developers.openai.com/api/docs/models/${config.model}`,
      inputOnly: false,
    };
  }
  // Account-specific quotas cannot be inferred from a key or billing selection.
  // This is application pacing, not a published quota or a promise of access.
  return {
    rpm: provider === "anthropic" ? 10 : 60,
    tpm: provider === "anthropic" ? 40000 : 120000,
    rpd: 0,
    label: "App planning example · actual account quotas unknown",
    source,
    inputOnly: provider === "gemini",
  };
}
