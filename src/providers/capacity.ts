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
  // Dedicated providers use fixed official endpoints. Private compatible endpoints
  // must never inherit a public model's account limits merely from its name.
  if (!["openai", "gemini"].includes(config.provider)) return null;
  const source =
    config.provider === "openai"
      ? "https://developers.openai.com/api/docs/guides/rate-limits"
      : "https://ai.google.dev/gemini-api/docs/rate-limits";
  const custom = safeCapacity(config.capacity);
  if (custom)
    return {
      ...custom,
      label: "Your dashboard limits",
      source,
      inputOnly: config.provider === "gemini",
    };
  if (config.provider === "openai") {
    if (!["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1"].includes(config.model))
      return null;
    return {
      rpm: 500,
      tpm: config.model === "gpt-4.1" ? 30000 : 200000,
      rpd: config.model === "gpt-4.1" ? 0 : 10000,
      label: "Published OpenAI Tier 1 · verify your project",
      source: `https://developers.openai.com/api/docs/models/${config.model}`,
      inputOnly: false,
    };
  }
  // Google does not publish a universal synchronous paid-quota table. These are
  // explicitly labeled app planning scenarios, never claimed as Google's limits.
  return config.billing === "free"
    ? {
        rpm: 5,
        tpm: 20000,
        rpd: 50,
        label: "Conservative free-tier assumption · verify in AI Studio",
        source,
        inputOnly: true,
      }
    : {
        rpm: 60,
        tpm: 120000,
        rpd: 3000,
        label: "Paid planning example · enter AI Studio limits",
        source,
        inputOnly: true,
      };
}
