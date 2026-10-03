import { test, expect } from "@playwright/test";
import { simplePaper } from "./helpers";

test("Gemini checks real JSON support, handles a listed but unavailable model, and recovers", async ({
  page,
}) => {
  await page.clock.install();
  const calls: { url: string; body: any }[] = [];
  await page.route(
    "https://generativelanguage.googleapis.com/**",
    async (route) => {
      const request = route.request();
      calls.push({ url: request.url(), body: request.postDataJSON() });
      expect(request.headers()["x-goog-api-key"]).toBe("FAKE-GEMINI-KEY");
      expect(request.url()).not.toContain("FAKE-GEMINI-KEY");
      if (request.method() === "GET") {
        await route.fulfill({
          json: {
            models: [
              {
                name: "models/gemini-2.5-flash",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/gemini-3.1-flash-lite",
                supportedGenerationMethods: ["generateContent"],
              },
              {
                name: "models/gemini-3.8-flash-tts",
                supportedGenerationMethods: ["generateContent"],
              },
            ],
          },
        });
      } else if (request.url().includes("gemini-2.5-flash")) {
        await route.fulfill({
          status: 404,
          json: {
            error: {
              message:
                "This model is no longer available to new users. Please use gemini-3.8-flash.",
            },
          },
        });
      } else {
        expect(request.postDataJSON().contents[0].parts[0].text).not.toContain(
          "Transformer",
        );
        expect(
          request.postDataJSON().generationConfig.responseJsonSchema.required,
        ).toEqual(["ok"]);
        await route.fulfill({
          json: {
            candidates: [
              {
                content: { parts: [{ text: '{"ok":true}' }] },
                finishReason: "STOP",
              },
            ],
          },
        });
      }
    },
  );
  await page.goto("/#workspace");
  await simplePaper(page);
  await page.locator("#provider").selectOption("gemini");
  await expect(page.locator("#model")).toHaveValue("gemini-3.1-flash-lite");
  await page.locator("#api-key").fill("FAKE-GEMINI-KEY");
  await page.locator(".connection-options summary").click();
  await expect(page.locator(".provider-actions")).toContainText(
    "uses your API quota",
  );
  await page.locator("#model").fill("gemini-2.5-flash");
  await page.locator("#model").blur();
  await page.locator("#check-key").click();
  await expect.poll(() => calls.length).toBe(1);
  await page.clock.fastForward(2000);
  await expect(page.locator("#status")).toContainText(
    "no longer available to new users",
  );
  await expect(page.locator("#status")).not.toContainText("Key accepted");
  await expect(page.locator("#status")).not.toContainText("FAKE-GEMINI-KEY");
  await page.locator("#recommended-model").click();
  await expect(page.locator("#model")).toHaveValue("gemini-3.1-flash-lite");
  await page.clock.fastForward(2000);
  await page.locator("#check-key").click();
  await expect.poll(() => calls.length).toBe(3);
  await page.clock.fastForward(2000);
  await expect(page.locator("#status")).toContainText(
    "passed structured JSON generation",
  );
  await expect(
    page.locator('#models option[value="gemini-3.8-flash-tts"]'),
  ).toHaveCount(0);
  expect(calls).toHaveLength(4);
  await page.reload();
  await expect(page.locator("#api-key")).toHaveValue("");
});
