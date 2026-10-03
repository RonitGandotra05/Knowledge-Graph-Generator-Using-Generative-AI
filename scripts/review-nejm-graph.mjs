// Explicit source review of the authorized NEJMoa2035389 browser evaluation.
// No API calls. Retain the untouched generation and record every correction.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const folder = resolve("output/evaluation/gemini-nejm");
const raw = JSON.parse(await readFile(`${folder}/NEJMoa2035389.json`, "utf8"));
const reviewed = structuredClone(raw),
  log = [];
const remove = new Set(["e12", "e13", "e18", "e23", "e24"]);
const reasons = {
  e12: "A list of adverse-event categories establishes no directed relationship between them.",
  e13: "A table assay label alone does not establish the supplied directed predicate.",
  e18: "Occurrences in vaccine and placebo groups do not establish that the vaccine causes Bell’s palsy.",
  e23: "Duplicate of the directly supported prevention relationship e16.",
  e24: "An author patent disclosure does not establish an experimental vaccine-target finding.",
};
const corrections = {
  e1: [
    "showed_94.1_percent_efficacy",
    "The quoted conclusion reports trial efficacy against Covid-19 illness.",
  ],
  e2: [
    "transient_reactogenicity_reported_after",
    "The quote reports moderate, transient reactogenicity more frequently after vaccination.",
  ],
  e3: [
    "prevented_illness_including_severe_disease",
    "The abstract conclusion includes severe disease; 94.1% is the overall illness efficacy estimate.",
  ],
  e6: [
    "measured_by",
    "Roche Elecsys assays binding antibodies, rather than detecting the virus itself.",
    "n16",
    "n5",
  ],
  e7: [
    "evaluated_for_severe_disease_efficacy",
    "This is a secondary endpoint, rather than the reported primary efficacy estimate.",
  ],
  e8: [
    "evaluated_prevention_of",
    "The quoted methods define prevention of severe Covid-19 as a secondary endpoint.",
  ],
  e9: ["detects", "The quote specifies a positive SARS-CoV-2 test by RT-PCR."],
  e10: [
    "calculates_efficacy_boundaries",
    "The methods explicitly assign calculation of efficacy boundaries to Lan–DeMets alpha spending.",
  ],
  e11: [
    "assesses",
    "The stratified Cox model is used to assess vaccine efficacy.",
  ],
  e14: [
    "used_for_primary_efficacy_analysis",
    "The primary efficacy endpoint is assessed in the per-protocol population.",
  ],
  e15: [
    "includes_per_protocol_population",
    "The per-protocol group is a subset of the modified intention-to-treat population.",
  ],
  e17: [
    "systemic_events_reported_more_often_after",
    "The quoted group comparison reports systemic adverse-event frequency; it does not attribute every event causally.",
  ],
  e19: [
    "used_to_assess_prior_infection",
    "Positive RT-PCR contributed to the trial’s baseline SARS-CoV-2 status definition.",
    "n4",
    "n3",
  ],
  e20: [
    "used_to_assess_prior_infection",
    "Positive nucleocapsid binding antibody assay contributed to the baseline status definition.",
    "n16",
    "n3",
  ],
  e21: [
    "similar_serious_event_incidence_to_placebo",
    "The quoted comparison reports a similar incidence throughout the trial.",
  ],
  e22: [
    "observed_imbalance_requires_monitoring",
    "The discussion describes an anecdotal imbalance and explicitly calls for monitoring.",
  ],
};
for (const edge of reviewed.graph.edges) {
  if (remove.has(edge.id)) {
    log.push({
      id: edge.id,
      action: "remove",
      reason: reasons[edge.id],
      original: edge,
    });
    continue;
  }
  const correction = corrections[edge.id];
  if (!correction) continue;
  const before = structuredClone(edge);
  [edge.relationship, edge.explanation] = correction;
  if (correction[2]) [edge.source, edge.target] = correction.slice(2);
  edge.edited = true;
  log.push({
    id: edge.id,
    action: "correct",
    reason: edge.explanation,
    original: before,
    corrected: edge,
  });
}
reviewed.graph.edges = reviewed.graph.edges.filter((e) => !remove.has(e.id));
// Only bibliography-grounded pulmonary immunopathology has no body evidence.
// Other isolated concepts remain visible with their source references.
reviewed.graph.nodes = reviewed.graph.nodes.filter(
  (n) => !["n24", "n28"].includes(n.id),
);
reviewed.concepts = reviewed.concepts.filter(
  (n) =>
    ![
      "Prefusion coronavirus spike proteins",
      "Pulmonary immunopathology",
    ].includes(n.label),
);
log.push({
  id: "n24",
  action: "remove",
  reason: "Concept’s only saved source is an author patent disclosure.",
});
log.push({
  id: "n28",
  action: "remove",
  reason:
    "Concept sourced only from a cited paper’s reference title, rather than this trial’s body.",
});
reviewed.name = "NEJM mRNA-1273 trial · reviewed compact graph";
reviewed.settings = {
  ...reviewed.settings,
  layout: "concentric",
  nodeShape: "card",
  graphScale: 0.7,
  nodeSize: 0.65,
  edgeLength: 0,
  nodeFontSize: 12,
  edgeFontSize: 10,
  positions: undefined,
  theme: "light",
  physics: false,
};
reviewed.warnings.push(
  "This copy includes explicit source review and marked predicate corrections. Original quotations are unchanged; review-log.json records each correction. The untouched Gemini generation remains NEJMoa2035389.json. This graph is not an exhaustive trial summary.",
);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    reducedMotion: "reduce",
  });
  const errors = [],
    offlineRequests = [];
  let offline = false;
  page.on("request", (request) => {
    if (offline && /^https?:/.test(request.url()))
      offlineRequests.push(request.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    process.env.ATLAS_TEST_URL || "http://127.0.0.1:5183/#workspace",
  );
  const rendered = await page.evaluate(async (analysis) => {
    const { GraphViewer } = await import("/src/graph/viewer.ts");
    const { htmlExport, safeAnalysis } = await import("/src/graph/export.ts");
    const root = document.createElement("div");
    root.id = "reviewed-export";
    document.querySelector("#app").style.display = "none";
    root.style.margin = "24px";
    document.body.append(root);
    const viewer = new GraphViewer(root, analysis);
    analysis.settings = viewer.snapshot();
    return { html: await htmlExport(analysis), json: safeAnalysis(analysis) };
  }, reviewed);
  await mkdir(folder, { recursive: true });
  await writeFile(
    `${folder}/NEJMoa2035389-reviewed.json`,
    JSON.stringify(rendered.json, null, 2),
  );
  await writeFile(`${folder}/NEJMoa2035389-reviewed.html`, rendered.html);
  await writeFile(`${folder}/review-log.json`, JSON.stringify(log, null, 2));
  const root = page.locator("#reviewed-export");
  await root.locator('[data-action="fit"]').click();
  const geometry = await root.locator(".graph-canvas").evaluate((element) => {
    const cy = element._cyreg.cy,
      boxes = [],
      missing = [],
      detached = [],
      collisions = [];
    const nodes = cy.nodes(":visible").map((node) => node.boundingBox());
    for (const edge of cy.edges(":visible")) {
      const box = edge.boundingBox({
          includeNodes: false,
          includeEdges: false,
          includeLabels: true,
        }),
        mid = edge.midpoint();
      if (!Number.isFinite(mid?.x) || box.w <= 0 || box.h <= 0)
        missing.push(edge.id());
      if (
        Math.abs((box.x1 + box.x2) / 2 - mid.x) > 2 ||
        Math.abs((box.y1 + box.y2) / 2 - mid.y) > 2
      )
        detached.push(edge.id());
      if (
        [...nodes, ...boxes].some(
          (other) =>
            box.x1 < other.x2 &&
            box.x2 > other.x1 &&
            box.y1 < other.y2 &&
            box.y2 > other.y1,
        )
      )
        collisions.push(edge.id());
      boxes.push(box);
    }
    return { missing, detached, collisions };
  });
  if (
    geometry.missing.length ||
    geometry.detached.length ||
    geometry.collisions.length
  )
    throw new Error(JSON.stringify(geometry));
  await root.screenshot({ path: `${folder}/reviewed-compact-light.png` });
  await root.locator('[data-action="readable"]').click();
  await root
    .locator(".graph-canvas")
    .screenshot({ path: `${folder}/reviewed-readable-light.png` });
  await root.locator('[data-action="theme"]').click();
  await root.locator('[data-action="fit"]').click();
  await root.screenshot({ path: `${folder}/reviewed-compact-dark.png` });
  await root.locator(".graph-export summary").click();
  for (const format of ["svg", "png"]) {
    const pending = page.waitForEvent("download");
    await root.locator(`[data-action="${format}"]`).click();
    await (await pending).saveAs(`${folder}/NEJMoa2035389-reviewed.${format}`);
  }
  offline = true;
  await page.goto("file://" + `${folder}/NEJMoa2035389-reviewed.html`);
  const count = await page.locator(".graph-count").textContent();
  if (
    errors.length ||
    offlineRequests.length ||
    !count.includes("19 relationships")
  )
    throw new Error(JSON.stringify({ errors, count }));
  await writeFile(
    `${folder}/review-verification.json`,
    JSON.stringify(
      {
        nodes: 26,
        edges: 19,
        corrections: log.length,
        errors,
        offlineReopened: true,
        offlineRequests,
        geometry,
      },
      null,
      2,
    ),
  );
  await page.goto("file://" + `${folder}/NEJMoa2035389-reviewed.svg`);
  await page.screenshot({ path: `${folder}/reviewed-svg-render.png` });
  console.log(
    JSON.stringify({
      nodes: 26,
      edges: 19,
      corrections: log.length,
      errors,
      offlineReopened: true,
      offlineRequests,
      geometry,
      folder,
    }),
  );
} finally {
  await browser.close();
}
