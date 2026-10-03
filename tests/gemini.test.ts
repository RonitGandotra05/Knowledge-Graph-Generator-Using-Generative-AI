import { afterEach, describe, expect, it, vi } from "vitest";
import { LLMProvider, providers } from "../src/providers/client";
import { RequestGuard } from "../src/providers/limits";
import { graphSchema } from "../src/providers/schema";
import { priceFor } from "../src/providers/usage";

const config = {
  provider: "gemini" as const,
  key: "TEST-SECRET",
  model: "gemini-3.8-flash",
  endpoint: "",
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const client = () => new LLMProvider(config, new RequestGuard());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Gemini account and structured output regressions", () => {
  it("defaults to the model that completed the live PDF extraction", () => {
    expect(providers.gemini.models[0]).toBe("gemini-3.1-flash-lite");
  });
  it("uses the published Flash 3.8 price before and after introductory pricing ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
    expect(priceFor(config)).toMatchObject({
      input: 0.75,
      output: 3.75,
      cached: 0.075,
    });
    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    expect(priceFor(config)).toMatchObject({
      input: 1.5,
      output: 7.5,
      cached: 0.15,
    });
  });

  it("accepts Google's models/ prefix and excludes thought parts from JSON", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        candidates: [
          {
            content: {
              parts: [
                { thought: true, text: "Internal reasoning, not JSON" },
                { text: '{"nodes":[],"edges":[]}' },
              ],
            },
            finishReason: "STOP",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await new LLMProvider(
      { ...config, model: " models/gemini-3.8-flash " },
      new RequestGuard(),
    ).structured("system", "document", graphSchema);
    expect(result).toEqual({ nodes: [], edges: [] });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(
      providers.gemini.endpoint + "/models/gemini-3.8-flash:generateContent",
    );
    expect(
      JSON.parse(options.body).generationConfig.responseJsonSchema,
    ).toEqual(graphSchema);
    expect(url + options.body).not.toContain(config.key);
    expect(options.headers["x-goog-api-key"]).toBe(config.key);
  });

  it("preserves the actual 404 reason and redacts echoed credentials without retrying", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response(
        {
          error: {
            status: "NOT_FOUND",
            message: `No longer available to new users. Use gemini-3.8-flash. Key: ${config.key}`,
          },
        },
        404,
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const error = await client()
      .structured("", "", graphSchema)
      .catch((e) => e.message);
    expect(error).toContain("No longer available to new users");
    expect(error).toContain("Check key & load models");
    expect(error).toContain("[redacted]");
    expect(error).not.toContain(config.key);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports schema rejection and invalid-key details, including model-list errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        response(
          {
            error: {
              message: "API key not valid. Please pass a valid API key.",
            },
          },
          400,
        ),
      ),
    );
    await expect(client().listModels()).rejects.toThrow("API key not valid");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        response(
          {
            error: {
              message: "responseJsonSchema is not supported by this model",
            },
          },
          400,
        ),
      ),
    );
    await expect(client().structured("", "", graphSchema)).rejects.toThrow(
      "responseJsonSchema is not supported",
    );
  });

  it("handles non-JSON error bodies without hiding actionable guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("upstream unavailable", { status: 404 }),
        ),
    );
    await expect(client().structured("", "", graphSchema)).rejects.toThrow(
      "unavailable for this account",
    );
  });

  it("loads text generation models and excludes incompatible media and embedding models", async () => {
    const names = [
      "gemini-3.8-flash",
      "gemini-2.5-flash",
      "gemini-3.8-flash-tts",
      "gemini-3.1-flash-image",
      "gemini-3.8-live",
      "gemini-robotics-er-2-preview",
      "gemini-3.5-transcribe",
      "gemma-4-31b-it",
    ];
    const fetch = vi.fn().mockResolvedValue(
      response({
        models: [
          ...names.map((name) => ({
            name: "models/" + name,
            supportedGenerationMethods: ["generateContent"],
          })),
          {
            name: "models/gemini-embedding-2",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await client().listModels()).toEqual([
      "gemini-2.5-flash",
      "gemini-3.8-flash",
    ]);
    expect(fetch.mock.calls[0][0]).toContain("pageSize=1000");
  });

  it("checks actual JSON generation without sending any document text", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await client().checkStructuredOutput();
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain("No document content");
    expect(body.generationConfig.responseJsonSchema.required).toEqual(["ok"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not call a model verified when its JSON fails the check", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response({
          candidates: [{ content: { parts: [{ text: '{"ok":false}' }] } }],
        }),
      ),
    );
    await expect(client().checkStructuredOutput()).rejects.toThrow(
      "did not pass",
    );
  });
});
