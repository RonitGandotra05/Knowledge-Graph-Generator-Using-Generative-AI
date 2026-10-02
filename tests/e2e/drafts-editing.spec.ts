import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { goFocus, goBuild, openHistory } from "./helpers";
const paper =
  "The Transformer uses attention. The decoder consumes the encoder output.";
async function uploadPDF(page: Page) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText(paper, { x: 40, y: 700, font, size: 14 });
  pdf
    .addPage()
    .drawText(
      "Results\nAttention helps the Transformer. The decoder uses attention.",
      { x: 40, y: 700, font, size: 14 },
    );
  await page.locator("#document-file").setInputFiles({
    name: "two-page-paper.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator("#document-summary")).toContainText("2 pages");
}
async function mock(page: Page, endpoint = "https://api.openai.com") {
  const requests: any[] = [];
  await page.route(endpoint + "/**", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const concepts = ["Transformer", "attention", "decoder"].map((label) => ({
      label,
      type: "Concept",
      aliases: [],
    }));
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
    ) {
      expect(body.messages[1].content).toContain("userFocus");
      result = { concepts };
    } else {
      const passage = [
        ...body.messages[1].content.matchAll(
          /\[([^\]]+)\] Page: [^\n]+\n([^\n]+)/g,
        ),
      ].find((m: any) => /The Transformer uses attention/.test(m[2]));
      expect(passage).toBeTruthy();
      result = {
        nodes: concepts.map((c, i) => ({ ...c, id: "n" + i })),
        edges: [
          {
            source: "n0",
            target: "n1",
            relationship: "uses",
            confidence: 0.8,
            evidence: "The Transformer uses attention.",
            passageId: passage[1],
            kind: "stated",
            explanation: "Test double with actual source text.",
          },
        ],
      };
    }
    await route.fulfill({
      json: {
        usage: { total_tokens: 150 },
        choices: [{ message: { content: JSON.stringify(result) } }],
      },
    });
  });
  return requests;
}

test("drafts survive New graph and refresh, resume without keys, and history is paginated", async ({
  page,
}) => {
  await page.goto("/#workspace");
  await uploadPDF(page);
  await goFocus(
    page,
    "Transformer, attention",
    "Explain how attention connects these methods",
  );
  await goBuild(page);
  await page.locator("#provider").selectOption("groq");
  await page.locator("#api-key").fill("DO-NOT-PERSIST-KEY");
  await page.locator("#new-analysis").click();
  await expect(page.locator("#focus")).toBeVisible();
  await expect(page.locator("#document-summary")).toBeHidden();
  await page.reload();
  await openHistory(page);
  await expect(page.locator(".history-card")).toHaveCount(1);
  await expect(page.locator(".history-status")).toHaveText("Ongoing");
  await page.locator("[data-open]").click();
  await expect(page.locator("#api-key")).toHaveValue("");
  await expect(page.locator("#provider")).toHaveValue("groq");
  await goBuild(page);
  await expect(page.locator("#focus")).toHaveValue(
    "Explain how attention connects these methods",
  );
  await goBuild(page);
  await expect(page.locator("#document-summary")).toContainText("2 pages");
  await page.locator("#text-preview summary").click();
  await expect(page.locator("#extracted-text")).toContainText("decoder");
  const stored = await page.evaluate(async () => {
    const path = "/src/storage/drafts.ts";
    const { drafts } = await import(path);
    return drafts.list();
  });
  expect(JSON.stringify(stored)).not.toContain("DO-NOT-PERSIST-KEY");
  expect(stored[0].document.passages.length).toBeGreaterThan(1);
  await page.evaluate(async () => {
    const path = "/src/storage/drafts.ts";
    const { drafts } = await import(path);
    const [first] = await drafts.list();
    for (let i = 0; i < 7; i++)
      await drafts.save({ ...first, id: "extra-" + i, name: "Extra " + i });
  });
  await openHistory(page);
  await expect(page.locator(".history-card")).toHaveCount(6);
  await expect(page.locator("#history-page")).toHaveText("1 / 2");
  await page.locator("#history-next").click();
  await expect(page.locator(".history-card")).toHaveCount(2);
  await expect(page.locator("#history-page")).toHaveText("2 / 2");
});

test("graph editing keeps proof, supports undo, saves drafts, and exports editable themed HTML", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const requests = await mock(page);
  await page.goto("/#workspace");
  await uploadPDF(page);
  await goFocus(
    page,
    "Transformer, attention",
    "Understand attention and its connections",
  );
  await goBuild(page);
  await page.locator("#api-key").fill("EDIT-TEST-KEY");
  await page.locator("#analyze").click();
  await expect(page.locator("#status")).toContainText("Graph ready:");
  await expect(page.locator("#analysis-meta")).toContainText("3 concepts");
  expect(requests).toHaveLength(2);
  await page.locator("#graph-root .accessible-graph summary").click();
  await page.locator("#graph-root [data-edge]").first().click();
  await expect(page.locator("#graph-root .evidence-location")).toContainText(
    "PDF page 1",
  );
  await expect(page.locator("#graph-root .evidence-location")).toContainText(
    "Paragraph",
  );
  await page.locator("#graph-root .source-passage summary").click();
  await expect(page.locator("#graph-root mark")).toHaveText(
    "The Transformer uses attention.",
  );
  await expect(page.locator("#graph-root .source-text")).toContainText(
    "decoder consumes",
  );
  await page.locator('#graph-root [data-action="edit-edge"]').click();
  await page
    .locator('.graph-editor [name="relationship"]')
    .fill("uses reviewed");
  await page
    .locator('.graph-editor [name="explanation"]')
    .fill("My reviewed interpretation");
  await page
    .locator(".graph-editor")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(page.locator("#graph-root .predicate")).toContainText(
    "uses reviewed",
  );
  await expect(page.locator("#graph-root blockquote")).toHaveText(
    "The Transformer uses attention.",
  );
  await page.locator("#graph-root [data-node]").first().click();
  await page.locator('#graph-root [data-action="edit-node"]').click();
  await page
    .locator('.graph-editor [name="label"]')
    .fill("Transformer reviewed");
  await page.locator('.graph-editor [name="color"]').fill("#cc77aa");
  await page
    .locator(".graph-editor")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(page.locator("#graph-root .evidence-content h3")).toHaveText(
    "Transformer reviewed",
  );
  await page.locator('#graph-root [data-action="delete-node"]').click();
  await page.locator('#graph-root [data-action="confirm-delete"]').click();
  await expect(page.locator("#graph-root .graph-count")).toContainText(
    "2 concepts · 0 relationships",
  );
  await page.locator('#graph-root [data-action="undo"]').click();
  await expect(page.locator("#graph-root .graph-count")).toContainText(
    "3 concepts · 1 relationships",
  );
  await page.locator('#graph-root [data-action="theme"]').click();
  const pending = page.waitForEvent("download");
  await page.locator("#export-html").click();
  const file = await pending;
  await mkdir(".artifacts", { recursive: true });
  const output = join(process.cwd(), ".artifacts/edited-graph.html");
  await file.saveAs(output);
  const offline = await context.newPage(),
    network: string[] = [];
  offline.on("pageerror", (e) => errors.push(e.message));
  offline.on("request", (r) => {
    if (r.url().startsWith("http")) network.push(r.url());
  });
  await offline.goto("file://" + output);
  await expect(offline.locator("body")).toHaveAttribute("data-theme", "light");
  await expect(offline.locator('select[aria-label="Node shape"]')).toHaveValue(
    "circle",
  );
  await offline.locator('select[aria-label="Node shape"]').selectOption("card");
  await offline.locator('[data-action="physics"]').click();
  await offline.locator(".accessible-graph summary").click();
  await offline.locator("[data-node]").first().click();
  await expect(offline.locator(".evidence-content h3")).toHaveText(
    "Transformer reviewed",
  );
  await offline.locator('[data-action="edit-node"]').click();
  await offline.locator('[name="label"]').fill("Offline renamed");
  await offline
    .locator(".graph-editor")
    .getByRole("button", { name: "Save changes" })
    .click();
  const again = offline.waitForEvent("download");
  await offline.locator("#html").click();
  const saved = await again;
  const editedPath = join(
    process.cwd(),
    ".artifacts/offline-edited-again.html",
  );
  await saved.saveAs(editedPath);
  await offline.goto("file://" + editedPath);
  await expect(offline.locator('select[aria-label="Node shape"]')).toHaveValue(
    "card",
  );
  await expect(offline.locator('[data-action="physics"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await offline.locator(".accessible-graph summary").click();
  await offline.locator("[data-node]").first().click();
  await expect(offline.locator(".evidence-content h3")).toHaveText(
    "Offline renamed",
  );
  expect(network).toEqual([]);
  await offline.close();
  await page.locator("#new-analysis").click();
  await openHistory(page);
  await page.locator("[data-open]").click();
  await expect(page.locator("#graph-root .graph-count")).toContainText(
    "3 concepts",
  );
  await page.locator("#graph-root .accessible-graph summary").click();
  await page.locator("#graph-root [data-node]").first().click();
  await expect(page.locator("#graph-root .evidence-content h3")).toHaveText(
    "Transformer reviewed",
  );
  expect(await readFile(output, "utf8")).not.toContain("EDIT-TEST-KEY");
  expect(errors).toEqual([]);
});

test("cancelled paced generation keeps discovered concepts for a one-call continuation", async ({
  page,
}) => {
  await page.clock.install();
  const requests = await mock(page, "https://api.cerebras.ai/v1");
  await page.goto("/#workspace");
  await uploadPDF(page);
  await goFocus(page);
  await goBuild(page);
  await page.locator("#provider").selectOption("compatible");
  await page.locator("#endpoint").fill("https://api.cerebras.ai/v1");
  await page.locator("#endpoint").blur();
  await page.locator("#model").fill("qwen-3.8-27b");
  await page.locator("#model").blur();
  await page.locator("#api-key").fill("CANCEL-TEST-KEY");
  await page.locator("#analyze").click();
  await expect(page.locator("#status")).toContainText(
    "Your progress is saved.",
  );
  await page.locator("#cancel-request").click();
  await expect(page.locator("#status")).toContainText("cancelled");
  expect(requests).toHaveLength(1);
  await page.clock.fastForward(16000);
  await page.locator("#resume-run").click();
  await expect(page.locator("#analysis-meta")).toContainText("1 relationships");
  expect(requests).toHaveLength(2);
});

test("existing version-one history upgrades without losing saved graphs", async ({
  page,
}) => {
  const { demoAnalysis } = await import("../../src/ui/demo");
  const saved = demoAnalysis();
  saved.id = "legacy-graph";
  saved.name = "Existing research";
  await page.goto("/favicon.svg");
  await page.evaluate(async (saved) => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("evidence-atlas", 1);
      r.onupgradeneeded = () =>
        r.result.createObjectStore("analyses", { keyPath: "id" });
      r.onsuccess = () => {
        const tx = r.result.transaction("analyses", "readwrite");
        tx.objectStore("analyses").put(saved);
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      r.onerror = () => reject(r.error);
    });
  }, saved);
  await page.goto("/#workspace");
  await openHistory(page);
  await expect(page.locator(".history-card h3")).toHaveText(
    "Existing research",
  );
  await page.locator("[data-open]").click();
  await expect(page.locator("#analysis-meta")).toContainText("9 concepts");
  await page.locator("#new-analysis").click();
  await uploadPDF(page);
  await goFocus(page);
  await page.locator("#new-analysis").click();
  await openHistory(page);
  await expect(page.locator(".history-card")).toHaveCount(2);
  await expect(page.locator(".history-status")).toContainText([
    "Ongoing",
    "Complete",
  ]);
});
