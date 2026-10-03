// Opt-in interactive browser evaluation. First stdin line is a memory-only key.
// Further lines: upload, check, run, resume, status, export, quit.
// Never use a real key in argv.
import { chromium } from "@playwright/test";
import { createInterface } from "node:readline";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const lines = createInterface({ input: process.stdin, terminal: false });
let key = "",
  browser,
  page;
const metrics = [],
  errors = [];
const output = resolve("output/evaluation/gemini-nejm");
const redact = (value) => String(value).replaceAll(key, "[redacted]");
const log = (value) => console.log(JSON.stringify(value));
console.log("Ready for memory-only Gemini key on stdin");
try {
  for await (const line of lines) {
    if (!key) {
      key = line.trim();
      if (!key) throw new Error("Enter a non-empty key");
      browser = await chromium.launch();
      page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      page.setDefaultTimeout(30000);
      page.on("pageerror", (e) => errors.push(redact(e.message)));
      page.on("response", async (r) => {
        if (!r.url().startsWith("https://generativelanguage.googleapis.com/"))
          return;
        try {
          const data = await r.json();
          const entry = {
            status: r.status(),
            path: new URL(r.url()).pathname,
            usage: data.usageMetadata,
            error: data.error ? redact(data.error.message) : undefined,
            finish: data.candidates?.[0]?.finishReason,
          };
          metrics.push(entry);
          log(entry);
        } catch {
          /* CORS preflight has no JSON body. */
        }
      });
      await page.goto(
        process.env.ATLAS_TEST_URL || "http://127.0.0.1:5183/#workspace",
      );
      log({ ready: true });
      continue;
    }
    try {
      if (line === "upload") {
        if (!process.env.ATLAS_TEST_PDF)
          throw new Error("Set ATLAS_TEST_PDF to the authorized local PDF");
        await page
          .locator("#document-file")
          .setInputFiles(process.env.ATLAS_TEST_PDF);
        await page.waitForFunction(() =>
          document
            .querySelector("#document-summary")
            ?.textContent.includes("Parsed locally"),
        );
        await page.locator("#provider").selectOption("gemini");
        if (process.env.ATLAS_TEST_MODEL) {
          await page.locator("#model").fill(process.env.ATLAS_TEST_MODEL);
          await page.locator("#model").blur();
        }
        await page.locator("#api-key").fill(key);
        await page
          .locator("#focus")
          .fill(
            "Map the clinical trial design, intervention, comparator, patient population, primary outcomes, efficacy findings and safety findings. Preserve exact evidence and distinguish experimental findings from background statements.",
          );
        log({
          parsed: await page.locator("#document-summary").innerText(),
          model: await page.locator("#model").inputValue(),
        });
      } else if (line === "check") {
        await page.locator(".connection-options summary").click();
        await page.locator("#check-key").click();
        await page.waitForFunction(
          () => !document.querySelector("#check-key").disabled,
          null,
          { timeout: 30000 },
        );
        log({ check: await page.locator("#status").innerText() });
      } else if (line === "run") {
        if (await page.locator("#resume-run").isVisible())
          await page.locator("#resume-run").click();
        else await page.locator("#analyze").click();
        log({ started: true });
      } else if (line === "resume") {
        await page.locator("#resume-run").click();
        log({ resumed: true });
      } else if (line === "status") {
        log({
          status: await page.locator("#status").innerText(),
          stage: await page.locator("#run-stage").innerText(),
          progress: await page.locator("#run-percent").innerText(),
          detail: await page.locator("#run-detail").innerText(),
          graph: await page.locator("#analysis-meta").innerText(),
          calls: metrics.length,
          errors,
        });
      } else if (line === "export") {
        if (
          !(await page.locator("#run-badge").innerText()).includes("COMPLETE")
        )
          throw new Error("Analysis is not complete");
        await mkdir(output, { recursive: true });
        for (const format of ["json", "html"]) {
          const downloaded = page.waitForEvent("download");
          await page.locator("#export-" + format).click();
          const file = resolve(output, `NEJMoa2035389.${format}`);
          await (await downloaded).saveAs(file);
          if ((await readFile(file, "utf8")).includes(key))
            throw new Error("Secret found in export");
        }
        const result = JSON.parse(
          await readFile(resolve(output, "NEJMoa2035389.json"), "utf8"),
        );
        const evidence = result.graph.edges.every(
          (e) => e.evidence?.length >= 15 && e.passageId && e.paperId,
        );
        if (
          !result.graph.nodes.length ||
          !result.graph.edges.length ||
          !evidence ||
          errors.length
        )
          throw new Error("Graph/evidence/browser verification failed");
        await page.evaluate(() => {
          const input = document.querySelector("#api-key");
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await page.screenshot({
          path: resolve(output, "graph.png"),
          fullPage: true,
        });
        const report = {
          complete: true,
          model: result.model,
          nodes: result.graph.nodes.length,
          edges: result.graph.edges.length,
          evidence,
          metrics,
          errors,
        };
        await writeFile(
          resolve(output, "verification.json"),
          JSON.stringify(report, null, 2),
        );
        log({ ...report, output });
      } else if (line === "quit") break;
      else log({ error: "Unknown command" });
    } catch (e) {
      log({ error: redact(e.message) });
    }
  }
} finally {
  key = "";
  await browser?.close();
  lines.close();
}
