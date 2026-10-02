import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { goFocus, goBuild } from "./helpers";
import { join } from "node:path";
import type {
  ResearchDocument,
  KnowledgeGraph,
  Passage,
} from "../../src/types";
import type { ContextSelection } from "../../src/retrieval/context";
interface Paper {
  id: string;
  title: string;
  source: string;
  pdf: string;
  field: string;
  terms: string[];
  expectedText: string;
  minimumPages: number;
}
const papers: Paper[] = JSON.parse(
  await readFile("tests/fixtures/online-papers.json", "utf8"),
);
const enabled = process.env.ONLINE_PAPERS === "1";
const sourceFolder = join(process.cwd(), ".artifacts/online-papers");
async function prepare(page: Page, paper: Paper) {
  await page.goto("/#workspace");
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "benchmark-file";
    input.hidden = true;
    document.body.append(input);
  });
  await page
    .locator("#benchmark-file")
    .setInputFiles(join(sourceFolder, paper.id + ".pdf"));
}
for (const paper of papers) {
  test(
    "online paper: " +
      paper.id +
      " · parse, budget, provenance, graph, and portable exports",
    async ({ page, context }) => {
      test.skip(
        !enabled,
        "Run npm run test:papers after fetching the public corpus.",
      );
      test.setTimeout(120000);
      await access(join(sourceFolder, paper.id + ".pdf"));
      const errors: string[] = [],
        providerRequests: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (
          /api\.openai|api\.anthropic|generativelanguage|api\.groq/.test(
            r.url(),
          )
        )
          providerRequests.push(r.url());
      });
      await prepare(page, paper);
      const result = await page.evaluate(async (paper) => {
        const parserPath = "/src/documents/parser.ts",
          retrievalPath = "/src/retrieval/context.ts",
          validationPath = "/src/graph/validate.ts",
          textPath = "/src/documents/text.ts",
          exportPath = "/src/graph/export.ts";
        const { parseDocument } = await import(parserPath),
          {
            parseTerms,
            selectContext,
            occurrences,
            discoveryContext,
            formatContext,
          } = await import(retrievalPath),
          { validateGraph } = await import(validationPath),
          { quoteKey } = await import(textPath),
          { jsonExport, importAnalysis } = await import(exportPath);
        const file = (
          document.querySelector("#benchmark-file") as HTMLInputElement
        ).files![0];
        const started = performance.now();
        const doc: ResearchDocument = await parseDocument(file);
        const parseMs = performance.now() - started;
        const concepts = parseTerms(paper.terms.join(","));
        const selections = [500, 1000, 6000].map((budget) => {
          const started = performance.now();
          const selection: ContextSelection = selectContext(
            doc,
            concepts,
            budget,
          );
          return {
            budget,
            ...selection,
            retrievalMs: performance.now() - started,
            serializedCharacters: formatContext(selection.passages).length,
            selectedTerms: [
              ...new Set(selection.passages.flatMap((p) => p.terms)),
            ],
            unmatchedAnnotations: selection.passages.flatMap((p) =>
              p.terms
                .filter((t) => !occurrences(p.text, t).length)
                .map((t) => ({ id: p.id, term: t })),
            ),
            uniqueKeys: new Set(selection.passages.map((p) => quoteKey(p.text)))
              .size,
          };
        });
        const missing: ContextSelection = selectContext(
          doc,
          parseTerms("ABSENT_CONCEPT_8e36a50c"),
          6000,
        );
        const upper: ContextSelection = selectContext(
          doc,
          parseTerms(paper.terms.map((t) => t.toUpperCase()).join(",")),
          6000,
        );
        const main = selections[2];
        const candidates = main.passages.filter(
          (p) =>
            !/^references$/i.test(p.section) &&
            paper.terms.filter((t) => occurrences(p.text, t).length).length >=
              2,
        );
        const passage = candidates[0] || main.passages[0];
        const nodes = paper.terms.map((label, i) => ({
          id: "n" + i,
          label,
          type: i % 2 ? "Method" : "Concept",
          aliases: [],
        }));
        const duplicate = {
          ...nodes[0],
          id: "duplicate",
          label: nodes[0].label.toUpperCase(),
        };
        const present = nodes.filter(
          (n) => occurrences(passage.text, n.label).length,
        );
        const valid = {
          source: present[0].id,
          target: present[1].id,
          relationship: "tested alongside",
          confidence: 0.85,
          evidence: passage.text,
          passageId: passage.id,
          kind: "implied",
          explanation:
            "TEST DOUBLE: exercises real document provenance and graph mechanics; this is not a live semantic extraction.",
        };
        const raw = {
          nodes: [...nodes, duplicate],
          edges: [
            valid,
            {
              ...valid,
              relationship: "also_mentioned",
              evidence: passage.text.slice(
                0,
                Math.min(150, passage.text.length),
              ),
            },
            {
              ...valid,
              evidence: "FABRICATED QUOTATION 8e36a50c NOT IN THE SOURCE",
            },
            { ...valid, passageId: "missing" },
            { ...valid, target: "invalid" },
            { ...valid, target: valid.source },
            valid,
          ],
        };
        const { graph, warnings } = validateGraph(raw, main.passages, {
          maxNodes: 30,
          maxEdges: 60,
          contextTokens: 6000,
          includeInferred: false,
        }) as { graph: KnowledgeGraph; warnings: string[] };
        const analysis = {
          version: 1,
          id: crypto.randomUUID(),
          name: paper.title + " · TEST DOUBLE",
          documentName: file.name,
          createdAt: new Date().toISOString(),
          provider: "Test double",
          model: "No live AI",
          concepts,
          graph,
          settings: {
            theme: "dark",
            layout: "cose",
            confidence: 0,
            hiddenTypes: [],
          },
          stats: {
            documentCharacters: doc.characters,
            sentCharacters: main.characters,
            passages: main.passages.length,
            estimatedTokens: main.estimatedTokens,
          },
          warnings: [
            ...doc.warnings,
            ...warnings,
            "TEST DOUBLE: this graph tests mechanics, not scientific conclusions.",
          ],
        };
        const json = jsonExport({
            ...analysis,
            key: "NEVER-EXPORT-BENCHMARK-KEY",
          }),
          imported = importAnalysis(json);
        return {
          id: paper.id,
          doc,
          parseMs,
          selections,
          missing,
          upper,
          discovery: discoveryContext(doc, 1000) as Passage[],
          graph,
          warnings,
          json,
          imported,
          caseCountsMatch: paper.terms.every(
            (t, i) =>
              main.matches[t] === upper.matches[paper.terms[i].toUpperCase()],
          ),
        };
      }, paper);
      await mkdir(join(sourceFolder, "results"), { recursive: true });
      await writeFile(
        join(sourceFolder, "results", paper.id + ".json"),
        JSON.stringify(
          {
            testedAt: new Date().toISOString(),
            source: paper.source,
            ...result,
          },
          null,
          2,
        ),
      );
      expect(result.doc.pages).toBeGreaterThanOrEqual(paper.minimumPages);
      expect(result.doc.characters).toBeGreaterThan(8000);
      expect(
        result.doc.passages
          .map((p) => p.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .toLowerCase(),
      ).toContain(paper.expectedText.toLowerCase());
      expect(result.caseCountsMatch).toBe(true);
      expect(result.missing.passages).toHaveLength(0);
      expect(result.missing.matchedPassages).toBe(0);
      for (const s of result.selections) {
        expect(s.passages.length).toBeGreaterThan(0);
        expect(s.matchedPassages).toBeGreaterThanOrEqual(s.passages.length);
        expect(s.characters).toBeLessThanOrEqual(s.budget * 4);
        expect(s.serializedCharacters).toBeLessThanOrEqual(s.budget * 4);
        expect(s.uniqueKeys).toBe(s.passages.length);
        expect(s.unmatchedAnnotations).toEqual([]);
        expect(s.retrievalMs).toBeLessThan(10000);
        expect(
          s.passages.every(
            (p) => p.page !== null && p.page >= 1 && p.page <= result.doc.pages,
          ),
        ).toBe(true);
      }
      const main = result.selections[2];
      expect(main.missing).toEqual([]);
      expect(result.graph.nodes).toHaveLength(paper.terms.length);
      expect(result.graph.edges).toHaveLength(2);
      expect(result.imported.graph.edges).toHaveLength(2);
      expect(result.json).not.toContain("NEVER-EXPORT");
      expect(
        result.graph.edges.every((e) =>
          main.passages.some((p) => p.id === e.passageId && p.page === e.page),
        ),
      ).toBe(true);
      expect(
        result.discovery.reduce((sum, p) => sum + p.text.length + 160, 0),
      ).toBeLessThanOrEqual(4000);
      // Exercise the actual app upload and import paths as well as its processing modules.
      await page
        .locator("#document-file")
        .setInputFiles(join(sourceFolder, paper.id + ".pdf"));
      await expect(page.locator("#document-summary")).toContainText(
        result.doc.pages + " pages",
        { timeout: 60000 },
      );
      await goFocus(page, paper.terms.join(", "));
      await goBuild(page);
      await expect(page.locator("#analyze")).toBeDisabled();
      expect(providerRequests).toEqual([]);
      // Run the complete extraction UI against a deterministic provider response.
      // PDF parsing, passage selection, request building, response validation,
      // and evidence provenance are real; semantic relationships are test data.
      const payloads: string[] = [];
      await page.route("https://api.openai.com/**", async (route) => {
        expect(route.request().headers().authorization).toBe(
          "Bearer CORPUS-TEST-KEY",
        );
        const body = route.request().postDataJSON();
        payloads.push(JSON.stringify(body));
        expect(JSON.stringify(body)).not.toContain("CORPUS-TEST-KEY");
        if (body.response_format.json_schema.schema.properties.concepts)
          return route.fulfill({
            json: {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      concepts: paper.terms.map((label) => ({
                        label,
                        type: "Concept",
                        aliases: [],
                      })),
                    }),
                  },
                },
              ],
            },
          });
        const excerpts = [
          ...body.messages[1].content.matchAll(
            /\[([^\]]+)\] Page: [^\n]+\n([\s\S]*?)(?=\n\n\[|$)/g,
          ),
        ];
        const edges = result.graph.edges.flatMap((edge: any) => {
          const passage = excerpts.find((m: any) =>
            m[2]
              .replace(/\s+/g, " ")
              .toLowerCase()
              .includes(edge.evidence.replace(/\s+/g, " ").toLowerCase()),
          );
          return passage ? [{ ...edge, passageId: passage[1] }] : [];
        });
        await route.fulfill({
          json: {
            choices: [
              {
                message: {
                  content: JSON.stringify({ nodes: result.graph.nodes, edges }),
                },
              },
            ],
          },
        });
      });
      await page.locator("#api-key").fill("CORPUS-TEST-KEY");
      await page.locator("#analyze").click();
      await expect(page.locator("#analysis-meta")).toContainText(
        "2 relationships",
      );
      expect(payloads.length).toBeGreaterThanOrEqual(2);
      expect(providerRequests).toHaveLength(payloads.length);
      await page.locator("#graph-root .accessible-graph summary").click();
      await page.locator("#graph-root [data-edge]").first().click();
      await expect(page.locator("#graph-root blockquote")).toHaveText(
        result.graph.edges[0].evidence,
      );
      await page.locator("#import-file").setInputFiles({
        name: paper.id + ".json",
        mimeType: "application/json",
        buffer: Buffer.from(result.json),
      });
      await expect(page.locator("#analysis-meta")).toContainText(
        "2 relationships",
      );
      await page.locator("#graph-root .accessible-graph summary").click();
      await page.locator("#graph-root [data-edge]").first().click();
      await expect(
        page.locator("#graph-root .evidence-location"),
      ).toContainText("PDF page " + result.graph.edges[0].page);
      await expect(page.locator("#graph-root blockquote")).toHaveText(
        result.graph.edges[0].evidence,
      );
      await page.locator("#save-analysis").click();
      await expect(page.locator("#history-items .history-card")).toHaveCount(2);
      const pending = page.waitForEvent("download");
      await page.locator("#export-html").click();
      const file = await pending,
        path = join(sourceFolder, "results", paper.id + ".html");
      await file.saveAs(path);
      const offline = await context.newPage();
      const network: string[] = [];
      offline.on("request", (r) => {
        if (/^https?:/.test(r.url())) network.push(r.url());
      });
      await offline.goto("file://" + path);
      await expect(offline.locator(".graph-count")).toContainText(
        paper.terms.length + " concepts",
      );
      await offline.locator(".accessible-graph summary").click();
      await offline.locator("[data-edge]").first().click();
      await expect(offline.locator("blockquote")).toHaveText(
        result.graph.edges[0].evidence,
      );
      await offline.locator('[data-action="theme"]').click();
      await expect(offline.locator("#viewer")).toHaveAttribute(
        "data-theme",
        "light",
      );
      await offline
        .locator('select[aria-label="Graph layout"]')
        .selectOption("circle");
      expect(network).toEqual([]);
      await offline.close();
      expect(errors).toEqual([]);
      console.log(
        JSON.stringify({
          paper: paper.id,
          pages: result.doc.pages,
          characters: result.doc.characters,
          parseMs: Math.round(result.parseMs),
          matches: main.totalOccurrences,
          passages: main.passages.length,
          contextReduction:
            Math.round((1 - main.characters / result.doc.characters) * 100) +
            "%",
        }),
      );
    },
  );
}
