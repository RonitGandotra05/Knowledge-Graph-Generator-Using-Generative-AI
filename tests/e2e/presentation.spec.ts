import { test, expect } from "@playwright/test";
import { goFocus, simplePaper, openHistory } from "./helpers";

test("home and complete setup fit desktop viewports in both themes without hiding required fields", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["dark", "light"]) {
      await page.goto("/");
      if ((await page.locator("html").getAttribute("data-theme")) !== theme)
        await page.locator("#home-theme").click();
      await expect(page.locator("#home .hero-actions")).toBeVisible();
      await expect(page.locator("#home .home-footer")).toBeInViewport();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
        .toBeLessThanOrEqual(viewport.height);
      await page.locator("#home-start").click();
      await expect(page.locator(".workflow-pages")).toHaveCount(0);
      for (const selector of [
        "#drop-zone",
        "#focus",
        "#terms",
        "#provider",
        "#model",
        "#api-key",
        "#analyze",
      ])
        await expect(page.locator(selector)).toBeInViewport();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
        .toBeLessThanOrEqual(viewport.height);
      await simplePaper(page);
      await page.locator("#provider").selectOption("groq");
      await expect(page.locator("#billing-plan")).toBeInViewport();
      await expect(page.locator("#run-estimate")).toContainText("tokens");
      await expect(page.locator("#analyze")).toBeInViewport();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
        .toBeLessThanOrEqual(viewport.height);
    }
  }
  expect(errors).toEqual([]);
});

test("an active analysis continues on the homepage and reopens through ongoing history without restarting", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  let calls = 0,
    release = () => {},
    held = false;
  await page.route("https://api.openai.com/**", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    const discovery =
      !!body.response_format.json_schema.schema.properties.concepts;
    if (!discovery) {
      held = true;
      await new Promise<void>((resolve) => (release = resolve));
    }
    const m = [
      ...body.messages[1].content.matchAll(
        /\[([^\]]+)\] Page: [^\n]+\n([^\n]+)/g,
      ),
    ].find((x: any) => x[2].includes("Transformer"))!;
    const concepts = discovery
      ? []
      : JSON.parse(
          body.messages[1].content.slice(
            0,
            body.messages[1].content.indexOf("\n["),
          ),
        ).concepts;
    const result = discovery
      ? {
          concepts: [
            { label: "Transformer", type: "Architecture", aliases: [] },
            { label: "attention", type: "Method", aliases: [] },
          ],
        }
      : {
          edges: [
            {
              source: concepts.find((n: any) => n.label === "Transformer").id,
              target: concepts.find((n: any) => n.label === "attention").id,
              relationship: "uses",
              confidence: 0.8,
              evidence: m[2],
              passageId: m[1],
              kind: "stated",
              explanation: "Controlled browser fixture.",
            },
          ],
        };
    await route.fulfill({
      json: {
        usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
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
  await simplePaper(page);
  await goFocus(page, "Transformer, attention");
  await page.locator("#api-key").fill("NAVIGATION-TEST-SECRET");
  await page.locator("#analyze").click();
  await expect.poll(() => held).toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeLessThanOrEqual(768);
  await page.locator(".brand").click();
  await expect(page.locator("#home")).toBeVisible();
  await expect(page.locator("#home-start")).toContainText("View live research");
  await page.locator("#home-nav [data-history]").click();
  await expect(
    page.locator("#history-items .history-status").first(),
  ).toHaveText("Ongoing");
  await page.locator("#history-items [data-open]").first().click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#run-badge")).toHaveText("LIVE ANALYSIS");
  await page.locator(".brand").click();
  release();
  await expect(page.locator("#home-start")).toHaveText("View your graph ↗");
  expect(calls).toBe(2);
  await expect(page.locator("#home")).toBeVisible();
  await page.locator("#home-start").click();
  await expect(page.locator("#analysis-meta")).toContainText("1 relationships");
  await expect(page.locator("#analysis-usage")).toContainText(
    "560 reported tokens",
  );
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeLessThanOrEqual(768);
  await expect(page.locator("#graph-root .accessible-graph")).toBeInViewport();
  await expect
    .poll(() =>
      page.locator("#graph-root .graph-canvas").evaluate((el) => {
        const cy = (el as any)._cyreg.cy;
        return cy
          .nodes()
          .toArray()
          .every((n: any) => {
            const box = n.renderedBoundingBox();
            return (
              box.x1 >= 0 &&
              box.y1 >= 0 &&
              box.x2 <= cy.width() &&
              box.y2 <= cy.height()
            );
          });
      }),
    )
    .toBe(true);
  await openHistory(page);
  await expect(
    page.locator("#history-items .history-status").first(),
  ).toHaveText("Complete");
});

test("the decorative scene respects reduced motion and mobile remains horizontally contained", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(
    await page
      .locator(".scene-float")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.locator("[data-depth-scene]").hover();
  expect(
    await page
      .locator(".research-artifact")
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--yaw")),
  ).toBe("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.locator('#home .hero-actions a[href="#workspace"]').click();
  for (const selector of ["#focus", "#api-key", "#analyze"])
    await expect(page.locator(selector)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});
