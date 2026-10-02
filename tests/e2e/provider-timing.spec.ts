import { test, expect } from "@playwright/test";
import { simplePaper, openHistory } from "./helpers";

test("long Groq estimates show calculated paid alternatives and switching restores the paid context", async ({
  page,
}) => {
  await page.goto("/#workspace");
  await page.locator("#provider").selectOption("groq");
  await page.locator("#document-file").setInputFiles({
    name: "large-research.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      Array.from(
        { length: 500 },
        (_, i) =>
          `Section ${i + 1}\n\n${"Alpha relates to Beta. ".repeat(100)}`,
      ).join("\n\n"),
    ),
  });
  await expect(page.locator("#document-summary")).toContainText(
    "Parsed locally",
  );
  await expect(page.locator("#run-estimate .quota-notice")).toContainText(
    "Paid API providers may finish much sooner",
  );
  await expect(
    page.locator("#run-estimate .paid-comparison summary"),
  ).toContainText(/OpenAI .*Gemini/);
  await page.locator("#run-estimate .paid-comparison summary").click();
  await expect(page.locator(".provider-comparison")).toContainText(
    "Published OpenAI Tier 1",
  );
  await expect(page.locator(".provider-comparison")).toContainText(
    "Paid planning example",
  );
  await expect(page.locator(".provider-comparison")).toContainText("USD");
  await expect(page.locator("#context-budget")).toHaveValue("1000");
  await page.locator("#provider").selectOption("openai");
  await expect(page.locator("#context-budget")).toHaveValue("6000");
  await expect(page.locator("#run-estimate .quota-notice")).toHaveCount(0);
  await page.locator(".connection-options summary").click();
  await page.locator("#custom-capacity").check();
  await page.locator("#api-key").fill("DUMMY-KEY");
  await page.locator("#capacity-rpm").fill("0");
  await page.locator("#capacity-rpm").blur();
  await expect(page.locator("#analyze")).toBeDisabled();
  await page.locator("#capacity-rpm").fill("500");
  await page.locator("#capacity-rpm").blur();
  await expect(page.locator("#analyze")).toBeEnabled();
  await page.locator("#capacity-rpd").fill("10");
  await page.locator("#capacity-rpd").blur();
  await expect(page.locator("#run-estimate .quota-notice")).toBeVisible();
  await page.locator("#run-estimate .estimate-assumptions summary").click();
  await expect(
    page.locator("#run-estimate .estimate-assumptions"),
  ).toContainText("Your dashboard limits");
});

test("dashboard quota inputs survive history recovery while the API key is erased", async ({
  page,
}) => {
  await page.goto("/#workspace");
  await simplePaper(page);
  await page.locator("#provider").selectOption("gemini");
  await page.locator(".connection-options summary").click();
  await page.locator("#custom-capacity").check();
  for (const [id, value] of [
    ["rpm", "30"],
    ["tpm", "80000"],
    ["rpd", "250"],
  ]) {
    await page.locator("#capacity-" + id).fill(value);
    await page.locator("#capacity-" + id).blur();
  }
  await page.locator("#api-key").fill("DUMMY-NOT-SAVED");
  await expect(page.locator("#draft-state")).toContainText("Saved");
  await page.reload();
  await openHistory(page);
  await page.locator("#history-items [data-open]").first().click();
  await expect(page.locator("#api-key")).toHaveValue("");
  await page.locator(".connection-options summary").click();
  await expect(page.locator("#custom-capacity")).toBeChecked();
  await expect(page.locator("#capacity-rpm")).toHaveValue("30");
  await expect(page.locator("#capacity-tpm")).toHaveValue("80000");
  await expect(page.locator("#capacity-rpd")).toHaveValue("250");
});

test("the live OpenAI run obeys the entered quota before sending its second request", async ({
  page,
}) => {
  await page.clock.install();
  let calls = 0;
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    const result = body.response_format.json_schema.schema.properties.concepts
      ? {
          concepts: [
            { label: "Transformer", type: "Architecture", aliases: [] },
            { label: "attention", type: "Method", aliases: [] },
          ],
        }
      : { edges: [] };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify(result) },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 450,
          completion_tokens: 120,
          total_tokens: 570,
        },
      }),
    });
  });
  await page.goto("/#workspace");
  await simplePaper(page);
  await page.locator("#provider").selectOption("openai");
  await page.locator(".connection-options summary").click();
  await page.locator("#custom-capacity").check();
  await page.locator("#capacity-rpm").fill("2");
  await page.locator("#capacity-rpm").blur();
  await page.locator("#api-key").fill("DUMMY-OPENAI");
  await page.locator("#analyze").click();
  await expect.poll(() => calls).toBe(1);
  await page.clock.fastForward(1000);
  await expect(page.locator("#run-badge")).toHaveText("PACING REQUESTS");
  expect(calls).toBe(1);
  await page.clock.fastForward(60001);
  await expect(page.locator("#run-badge")).toHaveText("ANALYSIS COMPLETE");
  expect(calls).toBe(2);
  await expect(page.locator("#analysis-usage")).toContainText(
    "1,140 reported tokens",
  );
});
