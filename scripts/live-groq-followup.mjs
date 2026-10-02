// Opt-in supplemental review: key arrives on non-echoed stdin, never in files.
import { chromium } from "@playwright/test";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
const input = createInterface({ input: process.stdin, terminal: false });
console.log("Ready for memory-only key on stdin");
const key = await new Promise((resolve) =>
  input.once("line", (s) => resolve(s.trim())),
);
input.close();
const folder = ".artifacts/live-groq",
  responses = [];
const base = JSON.parse(await readFile(`${folder}/reviewed-base.json`, "utf8"));
const doc = JSON.parse(
  await readFile(`${folder}/corrected-document.json`, "utf8"),
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(240000);
  page.on("response", async (r) => {
    if (!r.url().startsWith("https://api.groq.com/")) return;
    const data = await r.json();
    responses.push({
      status: r.status(),
      usage: data.usage,
      result: data.choices?.[0]?.message?.content
        ? JSON.parse(data.choices[0].message.content)
        : undefined,
      error: data.error
        ? {
            code: data.error.code,
            message: String(data.error.message || "").replaceAll(
              key,
              "[redacted]",
            ),
          }
        : undefined,
    });
    await writeFile(
      `${folder}/followup-metrics.json`,
      JSON.stringify({ responses }, null, 2),
    );
    console.log(
      JSON.stringify({
        call: responses.length,
        status: r.status(),
        usage: data.usage,
      }),
    );
  });
  await page.goto("http://127.0.0.1:5173/#workspace");
  await page
    .locator("#document-file")
    .setInputFiles("/Users/ronitgandotra/Downloads/05v1.pdf");
  await page.waitForFunction(
    () =>
      document
        .querySelector("#document-summary")
        ?.textContent.includes("14 pages"),
    null,
    { timeout: 240000 },
  );
  await page.locator('[data-step="1"]').click();
  await page
    .locator("#focus")
    .fill("Review missing mechanistic entities in the source paragraphs");
  await page.locator('[data-step="2"]').click();
  await page.locator("#provider").selectOption("groq");
  await page.locator("#api-key").fill(key);
  const reviewed = await page.evaluate(
    async ({ base, doc }) => {
      const h = await import("/evaluation-helpers.js");
      const selection = new Set([
        "p1-10",
        "p10-138",
        "p10-139",
        "p11-146",
        "p11-147",
      ]);
      const subset = {
        ...doc,
        passages: doc.passages.filter((p) => selection.has(p.id)),
      };
      const config = {
        provider: "groq",
        key: document.querySelector("#api-key").value,
        model: "openai/gpt-oss-20b",
        endpoint: "",
      };
      let requests = 0;
      const provider = new h.LLMProvider(
        config,
        h.requestGuard,
        async (tokens) => {
          if (requests >= 6)
            throw new Error("Supplemental review request cap reached");
          while (true) {
            const s = h.requestGuard.availability(config, tokens);
            if (!s.blocked) break;
            if (!s.retryAt || s.retryAt - Date.now() > 120000)
              throw new Error(s.reason);
            await new Promise((r) =>
              setTimeout(
                r,
                Math.max(1, Math.min(1000, s.retryAt - Date.now())),
              ),
            );
          }
          requests++;
        },
      );
      const options = {
        maxNodes: 150,
        maxEdges: 500,
        contextTokens: 1000,
        includeInferred: false,
      };
      let inventory = base.concepts;
      for (const batch of h.coverageBatches(subset, 1000)) {
        const known = inventory.filter((c) =>
          batch.some((p) =>
            [c.label, ...c.aliases].some((t) =>
              p.text.toLowerCase().includes(t.toLowerCase()),
            ),
          ),
        );
        const extra = await h.discover(
          provider,
          batch,
          known,
          { ...options, maxNodes: 12 },
          undefined,
          "Find important remaining mechanistic entities, metabolites, neurotransmitters, transporters, physiological systems and processes. Prioritize short-chain fatty acids (SCFAs), butyrate, ATP, ATP-binding cassette transporter, gut-brain axis, glutamate, serotonin and dopamine when explicitly present. Known conditions, organisms, pathways and genes are already retained; use slots for new concepts. Exclude writing tools, authors and generic counts.",
        );
        inventory = h.mergeGroundedConcepts([...inventory, ...extra], doc);
      }
      // Inventory starts from the reviewed graph; additions append stable IDs.
      const nodes = inventory.map((c, i) => ({ ...c, id: `n${i + 1}` }));
      const ids = new Map(
        base.graph.nodes.map((n) => [
          n.id,
          nodes.find((c) => [c.label, ...c.aliases].includes(n.label))?.id,
        ]),
      );
      const old = base.graph.edges.map((e) => ({
        ...e,
        source: ids.get(e.source),
        target: ids.get(e.target),
      }));
      const extracted = await h.extractCoverage(
        provider,
        subset,
        inventory,
        options,
        new AbortController().signal,
        async () => {},
        undefined,
        { completed: [], edges: old, rejected: 0 },
      );
      // Preserve evidence/edit labels for the original human-reviewed relationships.
      for (const n of extracted.graph.nodes)
        if (base.graph.nodes.some((x) => x.label === n.label && x.edited))
          n.edited = true;
      const result = {
        ...base,
        graph: extracted.graph,
        concepts: inventory,
        settings: { ...base.settings, positions: undefined },
        warnings: [
          ...base.warnings,
          ...extracted.warnings,
          `Supplementary live review made ${requests} requests on five original source paragraphs.`,
        ],
      };
      result.sources = h.attachProvenance(result.graph, doc, doc.passages);
      return result;
    },
    { base, doc },
  );
  await writeFile(`${folder}/reviewed.json`, JSON.stringify(reviewed, null, 2));
  await writeFile(
    `${folder}/reviewed-document.json`,
    JSON.stringify(doc, null, 2),
  );
  console.log(
    JSON.stringify({
      complete: true,
      nodes: reviewed.graph.nodes.length,
      edges: reviewed.graph.edges.length,
      requests: responses.length,
    }),
  );
} catch (e) {
  console.log(
    JSON.stringify({ error: String(e.message).replaceAll(key, "[redacted]") }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
