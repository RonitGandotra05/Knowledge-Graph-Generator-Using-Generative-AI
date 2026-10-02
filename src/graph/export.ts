import { safeUsage } from "../providers/usage";
import { safePapers } from "../documents/metadata";
import type { Analysis, Passage, SourceReference } from "../types";
import { escapeHTML, download } from "../ui/dom";
import viewerCSS from "./viewer.css?raw";
import { quoteKey } from "../documents/text";
import { validateGraph, validateConcepts } from "./validate";
export function safeAnalysis(a: Analysis): Analysis {
  return {
    version: 1,
    id: a.id,
    name: a.name,
    documentName: a.documentName,
    createdAt: a.createdAt,
    provider: a.provider,
    model: a.model,
    state: a.state,
    usage: a.usage ? safeUsage(a.usage) : undefined,
    papers: a.papers ? safePapers(a.papers) : undefined,
    concepts: a.concepts.map((c) => ({
      label: c.label,
      type: c.type,
      aliases: [...c.aliases],
      selected: c.selected,
    })),
    graph: {
      nodes: a.graph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        aliases: [...n.aliases],
        color: /^#[0-9a-f]{6}$/i.test(n.color || "") ? n.color : undefined,
        edited: n.edited || undefined,
        sources: n.sources?.map((r) => ({
          passageId: r.passageId,
          paperId: r.paperId,
          paperName: r.paperName,
          page: r.page,
          paragraph: r.paragraph,
          section: r.section,
          quote: r.quote,
        })),
      })),
      edges: a.graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        relationship: e.relationship,
        confidence: e.confidence,
        evidence: e.evidence,
        passageId: e.passageId,
        paperId: e.paperId,
        paperName: e.paperName,
        page: e.page,
        section: e.section,
        kind: e.kind,
        explanation: e.explanation,
        paragraph: e.paragraph,
        edited: e.edited || undefined,
      })),
    },
    sources: a.sources?.map((p) => ({
      id: p.id,
      paperId: p.paperId,
      paperName: p.paperName,
      text: p.text,
      page: p.page,
      paragraph: p.paragraph,
      section: p.section,
      terms: [],
    })),
    settings: {
      theme: a.settings.theme,
      layout: a.settings.layout,
      nodeShape: a.settings.nodeShape === "circle" ? "circle" : "card",
      physics: a.settings.physics !== false,
      confidence: a.settings.confidence,
      hiddenTypes: [...a.settings.hiddenTypes],
      positions: a.settings.positions,
    },
    stats: {
      documentCharacters: a.stats.documentCharacters,
      sentCharacters: a.stats.sentCharacters,
      passages: a.stats.passages,
      estimatedTokens: a.stats.estimatedTokens,
    },
    coverage: a.coverage
      ? {
          discoveryBatches: a.coverage.discoveryBatches,
          relationshipBatches: a.coverage.relationshipBatches,
          reviewedPassages: a.coverage.reviewedPassages,
          totalPassages: a.coverage.totalPassages,
          discoveredConcepts: a.coverage.discoveredConcepts,
          omittedConcepts: [...a.coverage.omittedConcepts],
        }
      : undefined,
    warnings: [...a.warnings],
  };
}
export const jsonExport = (a: Analysis) =>
  JSON.stringify(safeAnalysis(a), null, 2);
export async function htmlExport(a: Analysis): Promise<string> {
  const { default: runtime } = await import("../generated/viewer.js?raw");
  const payload = JSON.stringify(safeAnalysis(a))
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'"><title>${escapeHTML(a.name)} · Evidence Atlas</title><style>body{margin:0;padding:24px;background:#0b1017;color:#dce7ef;font:14px system-ui}body[data-theme=light]{background:#f6f8f8;color:#20313b}header{max-width:1400px;margin:0 auto 20px}h1{font-size:24px}header p{color:#92a5b5;font-size:12px}#viewer{max-width:1400px;margin:auto}footer{max-width:1400px;margin:20px auto;color:#92a5b5;font-size:11px}button{cursor:pointer}${viewerCSS}</style></head><body data-theme="${a.settings.theme}"><header><p>EVIDENCE ATLAS / OFFLINE RESEARCH GRAPH</p><h1>${escapeHTML(a.name)}</h1><p>${escapeHTML(a.documentName)} · ${escapeHTML(a.provider)} / ${escapeHTML(a.model)} · ${escapeHTML(a.createdAt.slice(0, 10))}</p><button id="json">Download JSON</button> <button id="html">Download edited HTML</button></header><div id="viewer"></div><footer>This file contains graph evidence, not your original document or API key. No network requests. AI interpretations need scientific review.</footer><script id="analysis" type="application/json">${payload}</script><script>${runtime.replace(/<\/script/gi, "<\\/script")}</script><script>const analysis=JSON.parse(document.getElementById('analysis').textContent);const viewer=EvidenceAtlasViewer.mount(document.getElementById('viewer'),analysis);document.addEventListener('graph-theme-change',e=>{document.body.dataset.theme=e.detail;});document.getElementById('json').onclick=()=>{analysis.settings=viewer.snapshot();const blob=new Blob([JSON.stringify(analysis,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='analysis.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};document.getElementById('html').onclick=()=>{analysis.settings=viewer.snapshot();const copy=document.documentElement.cloneNode(true);copy.querySelector('#analysis').textContent=JSON.stringify(analysis).replace(/</g,String.fromCharCode(92)+'u003c').replace(/\\u2028/g,String.fromCharCode(92)+'u2028').replace(/\\u2029/g,String.fromCharCode(92)+'u2029');const blob=new Blob(['<!doctype html>'+copy.outerHTML],{type:'text/html'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='edited-graph.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};</script></body></html>`;
}
export async function exportAnalysis(a: Analysis, format: "json" | "html") {
  const text = format === "json" ? jsonExport(a) : await htmlExport(a);
  const name =
    a.name
      .replace(/[^\p{L}\p{N} _-]/gu, "")
      .trim()
      .slice(0, 80) || "knowledge-graph";
  download(
    new Blob([text], {
      type: format === "json" ? "application/json" : "text/html",
    }),
    name + "." + format,
  );
}
export function importAnalysis(text: string): Analysis {
  if (text.length > 30_000_000)
    throw new Error("Analysis exceeds the 30 MB import limit.");
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Invalid analysis JSON.");
  }
  if (
    !raw ||
    raw.version !== 1 ||
    !raw.graph ||
    !Array.isArray(raw.graph.edges) ||
    !Array.isArray(raw.graph.nodes)
  )
    throw new Error(
      "Unsupported analysis format. Import a version 1 Evidence Atlas JSON export.",
    );
  const s = (v: unknown, fallback = "") =>
    typeof v === "string" ? v.slice(0, 500) : fallback;
  const integer = (v: unknown) =>
    Number.isInteger(v) && Number(v) > 0 ? Number(v) : 0;
  const sources: Passage[] = Array.isArray(raw.sources)
    ? raw.sources
        .slice(0, 10000)
        .filter(
          (p: any) =>
            p && typeof p.id === "string" && typeof p.text === "string",
        )
        .map((p: any) => ({
          id: s(p.id),
          paperId: s(p.paperId) || undefined,
          paperName: s(p.paperName) || undefined,
          text: p.text.slice(0, 5000),
          page: integer(p.page) || null,
          paragraph: integer(p.paragraph),
          section: s(p.section),
          terms: [],
        }))
    : [];
  const source = raw.graph.edges.map(
    (e: Record<string, unknown>, i: number) => ({
      id: `import-${i}`,
      paperId: s(e?.paperId) || undefined,
      paperName: s(e?.paperName) || undefined,
      text: typeof e?.evidence === "string" ? e.evidence.slice(0, 4000) : "",
      page:
        Number.isInteger(e?.page) && Number(e.page) > 0 ? Number(e.page) : null,
      section: s(e?.section, "Imported evidence"),
      paragraph: integer(e?.paragraph) || i + 1,
      terms: [],
    }),
  );
  const importedGraph = {
    ...raw.graph,
    edges: raw.graph.edges.map((e: Record<string, unknown>, i: number) => ({
      ...e,
      passageId: `import-${i}`,
    })),
  };
  const { graph, warnings } = validateGraph(importedGraph, source, {
    maxNodes: 1500,
    maxEdges: 5000,
    contextTokens: 12000,
    includeInferred: true,
  });
  for (const edge of graph.edges) {
    const index = Number(edge.passageId.slice("import-".length));
    const original = raw.graph.edges[index];
    edge.passageId = s(original?.passageId, edge.passageId);
    edge.edited = original?.edited === true || undefined;
    edge.paragraph = integer(original?.paragraph) || undefined;
    edge.paperId = s(original?.paperId) || undefined;
    edge.paperName = s(original?.paperName) || undefined;
    const savedSource = sources.find(
      (p) =>
        p.id === edge.passageId &&
        quoteKey(p.text).includes(quoteKey(edge.evidence)),
    );
    if (savedSource) {
      edge.paragraph = savedSource.paragraph;
      edge.page = savedSource.page;
      edge.section = savedSource.section;
      edge.paperId = savedSource.paperId;
      edge.paperName = savedSource.paperName;
    }
  }
  if (!graph.nodes.length && raw.graph.nodes.length)
    throw new Error("This analysis has no valid concepts.");
  const settings = raw.settings || {};
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of graph.nodes) {
    const original = raw.graph.nodes.find(
      (o: GraphNodeLike) =>
        typeof o?.label === "string" &&
        o.label.toLowerCase() === n.label.toLowerCase(),
    );
    if (original) {
      n.color = /^#[0-9a-f]{6}$/i.test(original.color || "")
        ? original.color
        : undefined;
      n.edited = original.edited === true || undefined;
      n.sources = Array.isArray(original.sources)
        ? original.sources.slice(0, 50).flatMap((r: any) => {
            const p = sources.find((p) => p.id === r?.passageId);
            if (
              !p ||
              typeof r.quote !== "string" ||
              !r.quote.trim() ||
              !quoteKey(p.text).includes(quoteKey(r.quote))
            )
              return [];
            return [
              {
                passageId: p.id,
                paperId: p.paperId,
                paperName: p.paperName,
                paragraph: p.paragraph,
                page: p.page,
                section: p.section,
                quote: r.quote.slice(0, 1200),
              } satisfies SourceReference,
            ];
          })
        : undefined;
    }
    const p = settings.positions?.[original?.id];
    if (
      p &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Math.abs(p.x) < 1e6 &&
      Math.abs(p.y) < 1e6
    )
      positions[n.id] = { x: p.x, y: p.y };
  }
  let concepts = [];
  try {
    concepts = validateConcepts(
      { concepts: raw.concepts || graph.nodes },
      1500,
    );
  } catch {
    concepts = graph.nodes.map((n) => ({ ...n, selected: true }));
  }
  const num = (x: unknown) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0;
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: s(raw.name, "Imported analysis"),
    documentName: s(raw.documentName, "Imported document"),
    createdAt: new Date().toISOString(),
    provider: s(raw.provider),
    model: s(raw.model),
    state: ["building", "paused", "complete"].includes(raw.state)
      ? raw.state
      : undefined,
    usage: raw.usage ? safeUsage(raw.usage) : undefined,
    papers: raw.papers ? safePapers(raw.papers) : undefined,
    concepts,
    graph,
    sources,
    settings: {
      theme: settings.theme === "light" ? "light" : "dark",
      layout: ["cose", "circle", "breadthfirst", "concentric", "grid"].includes(
        settings.layout,
      )
        ? settings.layout
        : "cose",
      nodeShape: settings.nodeShape === "circle" ? "circle" : "card",
      physics: settings.physics !== false,
      confidence: Math.min(1, num(settings.confidence)),
      hiddenTypes: Array.isArray(settings.hiddenTypes)
        ? settings.hiddenTypes.filter((x: unknown) => typeof x === "string")
        : [],
      positions: Object.keys(positions).length ? positions : undefined,
    },
    stats: {
      documentCharacters: num(raw.stats?.documentCharacters),
      sentCharacters: num(raw.stats?.sentCharacters),
      passages: num(raw.stats?.passages),
      estimatedTokens: num(raw.stats?.estimatedTokens),
    },
    coverage: raw.coverage
      ? {
          discoveryBatches: num(raw.coverage.discoveryBatches),
          relationshipBatches: num(raw.coverage.relationshipBatches),
          reviewedPassages: num(raw.coverage.reviewedPassages),
          totalPassages: num(raw.coverage.totalPassages),
          discoveredConcepts: num(raw.coverage.discoveredConcepts),
          omittedConcepts: Array.isArray(raw.coverage.omittedConcepts)
            ? raw.coverage.omittedConcepts
                .filter((c: unknown) => typeof c === "string")
                .slice(0, 150)
                .map((c: string) => c.slice(0, 120))
            : [],
        }
      : undefined,
    warnings: [
      ...warnings,
      "Imported evidence has not been checked against the original document.",
    ],
  };
}
interface GraphNodeLike {
  id: string;
  label: string;
  color?: string;
  edited?: boolean;
  sources?: SourceReference[];
}
