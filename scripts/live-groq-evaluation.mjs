// Manual, opt-in live evaluation. Key is read once from stdin and held in memory.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const lines = createInterface({ input: process.stdin, terminal: false });
let key = "",
  browser,
  server;
let queue = Promise.resolve();
const folder = ".artifacts/live-groq";
const log = (value) => process.stdout.write(JSON.stringify(value) + "\n");
async function initialize(secret) {
  key = secret.trim();
  if (!key.startsWith("gsk_")) throw new Error("Expected a Groq key");
  await mkdir(folder, { recursive: true });
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  server.stderr.on("data", () => {});
  browser = await chromium.launch();
  for (let i = 0; i < 50; i++) {
    try {
      await fetch("http://127.0.0.1:5173/");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  log({
    ready: true,
    commands: [
      "baseline",
      "final",
      "azoospermia",
      "oligospermia",
      "legacy",
      "quit",
    ],
  });
}
async function evaluate(name) {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1100 },
      reducedMotion: "reduce",
    }),
    responses = [],
    errors = [];
  page.setDefaultTimeout(180000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (response) => {
    if (!response.url().startsWith("https://api.groq.com/")) return;
    try {
      const data = await response.json();
      responses.push({
        status: response.status(),
        usage: data.usage,
        finish: data.choices?.[0]?.finish_reason,
        result: data.choices?.[0]?.message?.content
          ? JSON.parse(data.choices[0].message.content)
          : undefined,
        headers: Object.fromEntries(
          Object.entries(await response.allHeaders()).filter(
            ([k]) => k.startsWith("x-ratelimit") || k === "retry-after",
          ),
        ),
        error: data.error
          ? {
              type: data.error.type,
              code: data.error.code,
              message: String(data.error.message || "").replaceAll(
                key,
                "[redacted]",
              ),
            }
          : undefined,
      });
      log({
        run: name,
        call: responses.length,
        status: response.status(),
        usage: data.usage,
      });
    } catch {}
  });
  try {
    await page.goto("http://127.0.0.1:5173/#workspace");
    if (name === "baseline" || name === "final" || name === "corrected") {
      await page
        .locator("#document-file")
        .setInputFiles(process.env.ATLAS_TEST_PDF || ".artifacts/05v1.pdf");
      await page.waitForFunction(
        () =>
          document
            .querySelector("#document-summary")
            ?.textContent.includes("14 pages"),
        { timeout: 180000 },
      );
    } else {
      const { readdir } = await import("node:fs/promises");
      const paths = await readdir("legacy/" + name + "/research_papers");
      const texts = [];
      for (const file of paths.filter((p) => /ppr1\.txt$/i.test(p)))
        texts.push(
          await readFile("legacy/" + name + "/research_papers/" + file, "utf8"),
        );
      await page.locator("#document-file").setInputFiles({
        name: name + "-research.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(texts.join("\n\n")),
      });
      await page.waitForFunction(() =>
        document
          .querySelector("#document-summary")
          ?.textContent.includes("Parsed locally"),
      );
    }
    log({
      run: name,
      parsed: await page.locator("#document-summary").innerText(),
    });
    await page.locator('[data-step="1"]').click();
    await page
      .locator("#focus")
      .fill(
        name === "baseline" || name === "final" || name === "corrected"
          ? "Map the main findings, microbial biomarkers, all named significant pathways and genes, methods, and their evidence-backed relationships in this study."
          : `Map the important biomarkers, pathways, genes, clinical measures and methods for ${name}. Cover named findings with evidence and distinguish associations from mechanisms.`,
      );
    await page
      .locator("#terms")
      .fill(
        name === "baseline" || name === "final" || name === "corrected"
          ? "autism spectrum disorder, gut microbiome"
          : "",
      );
    await page.locator('[data-step="2"]').click();
    await page.locator("#provider").selectOption("groq");
    await page.locator("#api-key").fill(key);
    await page.locator("#analyze").click();
    let last = "";
    const start = Date.now();
    while (Date.now() - start < 3600000) {
      const status = await page.locator("#status").innerText();
      if (status !== last) {
        log({ run: name, status });
        last = status;
      }
      if (await page.locator("#graph-root .graph-count").count()) break;
      if (
        (await page.locator("#analyze").isEnabled()) &&
        responses.length &&
        /error|denied|rejected|returned|limit|failed|large|truncated|missing/i.test(
          status,
        )
      )
        throw new Error(status);
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!(await page.locator("#graph-root .graph-count").count()))
      throw new Error("Timed out waiting for graph");
    const next = page.waitForEvent("download");
    await page.locator("#export-json").click();
    const json = await next;
    await json.saveAs(folder + "/" + name + ".json");
    const htmlWait = page.waitForEvent("download");
    await page.locator("#export-html").click();
    await (await htmlWait).saveAs(folder + "/" + name + ".html");
    const canvas = page.locator("#graph-root .graph-canvas");
    const metrics = await canvas.evaluate((el) => {
      const cy = el._cyreg.cy,
        nodes = cy.nodes().toArray(),
        collisions = [];
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i].boundingBox(),
            b = nodes[j].boundingBox();
          if (a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1)
            collisions.push([nodes[i].data("label"), nodes[j].data("label")]);
        }
      return {
        nodes: nodes.length,
        edges: cy.edges().length,
        nodeCollisions: collisions,
        renderedFont: 15 * cy.zoom(),
      };
    });
    await page
      .locator("#graph-root")
      .screenshot({ path: folder + "/" + name + "-dark.png" });
    await page.locator('#graph-root [data-action="theme"]').click();
    await page
      .locator("#graph-root")
      .screenshot({ path: folder + "/" + name + "-light.png" });
    await page.locator("#graph-root .graph-export summary").click();
    const pngWait = page.waitForEvent("download");
    await page.locator('#graph-root [data-action="png"]').click();
    await (await pngWait).saveAs(folder + "/" + name + "-graph.png");
    const draft = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("evidence-atlas", 2);
          request.onsuccess = () => {
            const db = request.result,
              tx = db.transaction("drafts"),
              q = tx.objectStore("drafts").getAll();
            q.onsuccess = () => {
              resolve(q.result.at(-1));
              db.close();
            };
          };
          request.onerror = () => reject(new Error("Draft read failed"));
        }),
    );
    if (draft?.document)
      await writeFile(
        folder + "/" + name + "-document.json",
        JSON.stringify(draft.document, null, 2),
      );
    await writeFile(
      folder + "/" + name + "-metrics.json",
      JSON.stringify({ ...metrics, responses, errors }, null, 2),
    );
    log({ run: name, complete: true, ...metrics, errors });
  } catch (error) {
    log({
      run: name,
      error: String(error.message).replaceAll(key, "[redacted]"),
    });
    await writeFile(
      folder + "/" + name + "-failure.json",
      JSON.stringify({ responses, errors }, null, 2),
    );
  } finally {
    await page.close();
  }
}
async function legacy() {
  const { readdir } = await import("node:fs/promises");
  const results = [];
  for (const condition of [
    "azoospermia",
    "oligospermia",
    "asthenozoospermia",
    "hypospermia",
    "teratospermia",
  ]) {
    const files = await readdir("legacy/" + condition + "/html");
    const page = await browser.newPage({
        viewport: { width: 1500, height: 1100 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      "http://127.0.0.1:5173/legacy/" + condition + "/html/" + files[0],
    );
    await page.waitForFunction(() => typeof network !== "undefined", {
      timeout: 30000,
    });
    await page.evaluate(() => network.stabilize(2500));
    await new Promise((r) => setTimeout(r, 2500));
    const data = await page.evaluate(() => ({
      nodes: nodes.get(),
      edges: edges.get(),
      physics: network.physics.options,
    }));
    await page.screenshot({ path: folder + "/legacy-" + condition + ".png" });
    results.push({
      condition,
      nodes: data.nodes.length,
      edges: data.edges.length,
      errors,
    });
    await writeFile(
      folder + "/legacy-" + condition + ".json",
      JSON.stringify(data, null, 2),
    );
    await page.close();
  }
  await writeFile(
    folder + "/legacy-inventory.json",
    JSON.stringify(results, null, 2),
  );
  log({ legacy: results });
}
lines.on("line", (line) => {
  queue = queue
    .then(async () => {
      if (!key) return initialize(line);
      if (line === "quit") {
        await browser?.close();
        server?.kill();
        key = "";
        process.exit(0);
      }
      if (line === "legacy") return legacy();
      return evaluate(line);
    })
    .catch((e) =>
      log({
        error:
          "Evaluation command failed: " +
          String(e.message).replaceAll(key, "[redacted]"),
      }),
    );
});
process.on("SIGTERM", () => {
  server?.kill();
  browser?.close().finally(() => process.exit(0));
});
log({
  keyInput: "Enter key on stdin; input is not echoed and is never saved.",
});
