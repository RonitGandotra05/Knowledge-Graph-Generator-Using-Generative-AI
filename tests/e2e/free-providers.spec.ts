import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { providers } from "../../src/providers/client";
import { outputBudget } from "../../src/providers/limits";
import { simplePaper, goFocus, goBuild } from "./helpers";

for (const provider of ["groq", "cerebras"] as const) {
  test(`${provider}: guided discovery, paced extraction, exports, and quotas`, async ({
    page,
  }) => {
    const preset = providers[provider],
      secret = `MOCK-${provider}-KEY`;
    const requests: any[] = [],
      errors: string[] = [];
    let reject = false;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install();
    await page.route(preset.endpoint + "/**", async (route) => {
      const request = route.request(),
        body = request.postDataJSON();
      expect(request.headers().authorization).toBe("Bearer " + secret);
      expect(request.url()).not.toContain(secret);
      expect(request.postData() || "").not.toContain(secret);
      requests.push(body);
      if (request.url().endsWith("/models"))
        return route.fulfill({
          json: { data: preset.models.map((id) => ({ id })) },
        });
      expect(body.model).toBe(preset.models[0]);
      expect(body.reasoning_effort).toBe("low");
      if (provider === "groq")
        expect(body.response_format.json_schema.strict).toBe(true);
      else expect(body.response_format.type).toBe("json_object");
      expect(body.max_completion_tokens || body.max_tokens).toBe(
        outputBudget(
          { provider, key: secret, model: preset.models[0], endpoint: "" },
          body.response_format.json_schema?.schema ||
            JSON.parse(
              body.messages[0].content.split(
                "Return JSON matching this schema:\n",
              )[1] || "{}",
            ),
        ),
      );
      if (reject)
        return route.fulfill({
          status: 429,
          headers: { "retry-after": "90" },
          json: { error: { message: "quota" } },
        });
      const concepts = ["Transformer", "attention", "encoder", "decoder"].map(
        (label) => ({ label, type: "Concept", aliases: [] }),
      );
      let result;
      if (
        (
          body.response_format.json_schema?.schema ||
          JSON.parse(
            body.messages[0].content.split(
              "Return JSON matching this schema:\n",
            )[1] || "{}",
          )
        ).properties.concepts
      )
        result = { concepts };
      else {
        const passage = [
          ...body.messages[1].content.matchAll(
            /\[([^\]]+)\] Page: [^\n]+\n([^\n]+)/g,
          ),
        ].find((m: any) => /Transformer/.test(m[2]));
        if (!passage) throw new Error("Missing real context");
        result = {
          nodes: concepts.slice(0, 2).map((c, i) => ({ ...c, id: "n" + i })),
          edges: [
            {
              source: "n0",
              target: "n1",
              relationship: "uses",
              confidence: 0.8,
              evidence: passage[2],
              passageId: passage[1],
              kind: "stated",
              explanation: "Mock provider workflow test.",
            },
          ],
        };
      }
      await route.fulfill({
        json: {
          usage: { total_tokens: 150 },
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(result) },
            },
          ],
        },
      });
    });
    await page.goto("/#workspace");
    await expect(page.locator("[data-mode]")).toHaveCount(0);
    await simplePaper(page);
    await goFocus(page);
    await goBuild(page);
    await page
      .locator("#provider")
      .selectOption(provider === "cerebras" ? "compatible" : provider);
    if (provider === "cerebras") {
      await page.locator("#endpoint").fill(preset.endpoint);
      await page.locator("#endpoint").blur();
      await page.locator("#model").fill(preset.models[0]);
      await page.locator("#model").blur();
    }
    await expect(page.locator("#model")).toHaveValue(preset.models[0]);
    if (provider === "groq")
      await expect(page.locator("#provider-key-link")).toHaveAttribute(
        "href",
        preset.keyUrl!,
      );
    await expect(page.locator("#provider-start")).toContainText(
      "Groq offers a free tier",
    );
    await page.locator("#api-key").fill(secret);
    await page.locator("#key-info").hover();
    await expect(page.locator("#key-privacy")).toHaveText(
      "Memory only. No browser storage. Refresh clears your key.",
    );
    await page.locator("#check-key").click();
    await expect(page.locator("#status")).toContainText("Key accepted");
    await page.clock.fastForward(16000);
    await page.locator("#analyze").click();
    await expect(page.locator("#status")).toContainText(
      "Your progress is saved.",
    );
    await page.clock.fastForward(16000);
    await expect(page.locator("#analysis-meta")).toContainText(
      "1 relationships",
    );
    await page.locator("#graph-root .accessible-graph summary").click();
    await page.locator("#graph-root [data-edge]").first().click();
    await expect(page.locator("#graph-root blockquote")).toContainText(
      "Transformer",
    );
    await page.locator("#graph-root .source-passage summary").click();
    await expect(page.locator("#graph-root mark")).toContainText("Transformer");
    const pending = page.waitForEvent("download");
    await page.locator("#export-json").click();
    const json = JSON.parse(
      await readFile((await (await pending).path())!, "utf8"),
    );
    expect(JSON.stringify(json)).not.toContain(secret);
    expect(json.graph.nodes.every((n: any) => n.sources.length)).toBe(true);
    expect(requests).toHaveLength(3);
    reject = true;
    await goBuild(page);
    await page.clock.fastForward(60001);
    await page.locator("#analyze").click();
    await expect(page.locator("#status")).toContainText("quota");
    await expect(page.locator("#analyze")).toBeDisabled();
    await goBuild(page);
    await page.locator("#model").fill(preset.models[1]);
    await page.locator("#model").blur();
    await expect(page.locator("#check-key")).toBeDisabled();
    expect(requests).toHaveLength(4);
    await page.locator("#api-key").fill("");
    await page.setViewportSize({ width: 390, height: 844 });
    await mkdir(".artifacts", { recursive: true });
    await page.locator("#key-info").focus();
    await page
      .locator("#provider-form")
      .screenshot({ path: `.artifacts/${provider}-provider-mobile.png` });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
  });
  test(`${provider}: invalid keys stop calls, custom models use smaller budgets`, async ({
    page,
  }) => {
    let calls = 0;
    await page.clock.install();
    await page.route(providers[provider].endpoint + "/**", async (route) => {
      calls++;
      await route.fulfill({
        status: 401,
        json: { error: { message: "Invalid test key" } },
      });
    });
    await page.goto("/#workspace");
    await simplePaper(page);
    await goFocus(page);
    await goBuild(page);
    await page
      .locator("#provider")
      .selectOption(provider === "cerebras" ? "compatible" : provider);
    if (provider === "cerebras") {
      await page.locator("#endpoint").fill(providers[provider].endpoint);
      await page.locator("#endpoint").blur();
      await page.locator("#model").fill(providers[provider].models[0]);
      await page.locator("#model").blur();
    }
    await page.locator("#api-key").fill("REJECTED-TEST-KEY");
    await page.locator("#check-key").click();
    await expect(page.locator("#status")).toContainText("denied");
    await page.clock.fastForward(120000);
    await expect(page.locator("#check-key")).toBeDisabled();
    await page.locator("#model").fill("unknown-model");
    await page.locator("#model").blur();
    await expect(page.locator("#check-key")).toBeDisabled();
    await expect(page.locator("#context-budget")).toHaveAttribute("max", "500");
    await expect(page.locator("#max-nodes")).toHaveAttribute("max", "150");
    await expect(page.locator("#max-edges")).toHaveAttribute("max", "500");
    if (provider === "groq") await page.locator("#recommended-model").click();
    else {
      await page.locator("#model").fill(providers[provider].models[0]);
      await page.locator("#model").blur();
    }
    await expect(page.locator("#model")).toHaveValue(
      providers[provider].models[0],
    );
    await page.locator("#api-key").fill("CORRECTED-TEST-KEY");
    await expect(page.locator("#check-key")).toBeEnabled();
    expect(calls).toBe(1);
  });
}

test("all providers keep credentials out of storage and clear on refresh", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("evidence-atlas-key:groq", "OLD-DUMMY-KEY");
    localStorage.setItem("theme-test", "dark");
    const original = Storage.prototype.setItem;
    (window as any).storageWrites = [];
    Storage.prototype.setItem = function (key, value) {
      (window as any).storageWrites.push([key, value]);
      return original.call(this, key, value);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const provider of Object.keys(providers).filter(
    (id) => id !== "cerebras",
  )) {
    await page.goto("/#workspace");
    await simplePaper(page);
    await goFocus(page);
    await goBuild(page);
    await page.locator("#provider").selectOption(provider);
    if (provider === "compatible") {
      await page.locator("#endpoint").fill("https://");
      await page.locator("#endpoint").blur();
    }
    await page.locator("#key-info").focus();
    await expect(page.locator("#key-privacy")).toBeVisible();
    await page.locator("#key-info").press("Escape");
    await expect(page.locator("#key-privacy")).toBeHidden();
    await page.locator("#api-key").fill("MEMORY-ONLY-TEST-KEY");
    expect(
      await page.evaluate(() => ({
        legacy: Object.keys(localStorage).filter((k) =>
          k.startsWith("evidence-atlas-key:"),
        ),
        keys: [
          ...Object.values(localStorage),
          ...Object.values(sessionStorage),
        ].filter((v) => v.includes("TEST-KEY") || v.includes("DUMMY-KEY")),
        writes: (window as any).storageWrites.filter(
          ([, v]: [string, string]) => v.includes("TEST-KEY"),
        ),
        unrelated: localStorage.getItem("theme-test"),
      })),
    ).toEqual({ legacy: [], keys: [], writes: [], unrelated: "dark" });
    await page.reload();
    await expect(page.locator("#api-key")).toHaveValue("");
  }
  expect(errors).toEqual([]);
});
