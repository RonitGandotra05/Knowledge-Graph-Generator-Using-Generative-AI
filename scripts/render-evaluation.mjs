// Local rendering/provenance audit only: this script never makes an AI request.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const names = process.argv.slice(2);
const output = "output/evaluation";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const normalize = (text) =>
  text
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/([\p{L}])-\s*\n\s*([\p{Ll}])/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
try {
  for (const name of names) {
    const input = resolve(`.artifacts/live-groq/${name}.json`),
      raw = JSON.parse(await readFile(input, "utf8"));
    const document = JSON.parse(
      await readFile(`.artifacts/live-groq/${name}-document.json`, "utf8"),
    );
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1100 },
      reducedMotion: "reduce",
    });
    const errors = [],
      aiRequests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (
        /api\.groq|api\.openai|api\.anthropic|generativelanguage/.test(r.url())
      )
        aiRequests.push(r.url());
    });
    await page.goto("http://127.0.0.1:5173/#workspace");
    await page.locator("#import-file").setInputFiles(input);
    await page.locator("#graph-root .graph-count").waitFor();
    const exportFile = async (selector, filename) => {
      const pending = page.waitForEvent("download");
      await page.locator(selector).click();
      await (await pending).saveAs(output + "/" + filename);
    };
    const prefix = ["final", "corrected", "final-reviewed"].includes(name)
      ? "05v1"
      : name;
    const root = page.locator("#graph-root"),
      canvas = root.locator(".graph-canvas");
    const check = () =>
      canvas.evaluate((el) => {
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
          collisions,
          renderedFont: 15 * cy.zoom(),
        };
      });
    const layouts = [];
    for (const shape of ["circle", "card"]) {
      await root.locator('select[aria-label="Node shape"]').selectOption(shape);
      for (const layout of [
        "cose",
        "circle",
        "breadthfirst",
        "concentric",
        "grid",
      ]) {
        await root
          .locator('select[aria-label="Graph layout"]')
          .selectOption(layout);
        const metrics = await check();
        layouts.push({ shape, layout, ...metrics });
        if (metrics.collisions.length)
          throw new Error(`Collisions in ${name}/${shape}/${layout}`);
      }
    }
    await root
      .locator('select[aria-label="Node shape"]')
      .selectOption("circle");
    await root
      .locator('select[aria-label="Graph layout"]')
      .selectOption("cose");
    const theme = await root.getAttribute("data-theme");
    if (theme !== "dark") await root.locator('[data-action="theme"]').click();
    await exportFile("#export-json", prefix + "-graph.json");
    await exportFile("#export-html", prefix + "-graph-dark.html");
    await root.screenshot({
      path: output + "/" + prefix + "-readable-dark.png",
    });
    await root.locator('[data-action="fit"]').click();
    await root.screenshot({
      path: output + "/" + prefix + "-overview-dark.png",
    });
    await root.locator(".graph-export summary").click();
    await exportFile(
      '#graph-root [data-action="png"]',
      prefix + "-graph-dark.png",
    );
    await exportFile(
      '#graph-root [data-action="svg"]',
      prefix + "-graph-dark.svg",
    );
    await root.locator(".graph-export summary").click();
    await root.locator('[data-action="theme"]').click();
    await exportFile("#export-html", prefix + "-graph-light.html");
    await root.screenshot({
      path: output + "/" + prefix + "-overview-light.png",
    });
    await root.locator(".graph-export summary").click();
    await exportFile(
      '#graph-root [data-action="png"]',
      prefix + "-graph-light.png",
    );
    const final = JSON.parse(
      await readFile(output + "/" + prefix + "-graph.json", "utf8"),
    );
    const sourceMatches = final.graph.edges.map((e) => ({
      id: e.id,
      matchesOriginalOCR: document.passages.some(
        (p) =>
          p.page === e.page &&
          p.paragraph === e.paragraph &&
          normalize(p.text).includes(normalize(e.evidence)),
      ),
      page: e.page,
      paragraph: e.paragraph,
    }));
    const headline = [
      "Sutterella",
      "Prevotella",
      "Blautia",
      "Substance dependence",
      "Circulatory system",
      "Parasitic infectious disease",
      "K02014",
      "K03585",
      "K06147",
    ].map((term) => ({
      term,
      nodes: final.graph.nodes
        .filter((n) =>
          [n.label, ...n.aliases].some((t) =>
            normalize(t).includes(normalize(term)),
          ),
        )
        .map((n) => ({
          id: n.id,
          label: n.label,
          pages: [...new Set((n.sources || []).map((s) => s.page))],
        })),
    }));
    const offline = await browser.newPage();
    const network = [];
    offline.on("request", (r) => {
      if (/^https?:/.test(r.url())) network.push(r.url());
    });
    await offline.goto(
      "file://" + resolve(output + "/" + prefix + "-graph-dark.html"),
    );
    await offline.locator(".graph-count").waitFor();
    await offline.locator(".accessible-graph summary").click();
    if (final.graph.edges.length) {
      await offline.locator("[data-edge]").first().click();
      await offline.locator("blockquote").waitFor();
    }
    await offline.close();
    const audit = {
      rawNodes: raw.graph.nodes.length,
      rawEdges: raw.graph.edges.length,
      finalNodes: final.graph.nodes.length,
      finalEdges: final.graph.edges.length,
      locallyRejectedEdges: raw.graph.edges.filter(
        (e) =>
          !final.graph.edges.some(
            (f) =>
              f.source === e.source &&
              f.target === e.target &&
              f.relationship === e.relationship &&
              f.evidence === e.evidence,
          ),
      ),
      headline: ["final", "corrected", "final-reviewed"].includes(name)
        ? headline
        : undefined,
      nodeReferences: final.graph.nodes.filter((n) => n.sources?.length).length,
      sourceMatches,
      layouts,
      offlineRequests: network,
      aiRequests,
      errors,
    };
    if (
      aiRequests.length ||
      network.length ||
      errors.length ||
      sourceMatches.some((s) => !s.matchesOriginalOCR)
    )
      throw new Error("Rendering/evidence audit failed");
    await writeFile(
      output + "/" + prefix + "-audit.json",
      JSON.stringify(audit, null, 2),
    );
    console.log(
      JSON.stringify({
        name,
        nodes: audit.finalNodes,
        edges: audit.finalEdges,
        rejected: audit.locallyRejectedEdges.length,
        headline: audit.headline?.filter((h) => h.nodes.length).length,
        allQuotesMatch: true,
        layoutChecks: layouts.length,
        offlineNetworkRequests: network.length,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
