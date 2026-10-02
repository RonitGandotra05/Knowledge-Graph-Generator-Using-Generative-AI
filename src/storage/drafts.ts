import type {
  Analysis,
  Concept,
  ExtractionOptions,
  ResearchDocument,
  PaperRecord,
  UsageTotals,
} from "../types";
import { safeUsage } from "../providers/usage";
import { safePapers } from "../documents/metadata";
import type { DiscoveryProgress } from "../providers/coverage";
import { safeAnalysis } from "../graph/export";
import type { ExtractionProgress } from "../providers/coverage";
import type { ProviderId } from "../providers/client";
export interface Draft {
  id: string;
  name: string;
  updatedAt: string;
  status: "ongoing" | "complete";
  step: number;
  focus: string;
  keywords: string;
  document: ResearchDocument | null;
  concepts: Concept[];
  options: ExtractionOptions;
  provider: {
    provider: ProviderId;
    model: string;
    endpoint: string;
    billing?: "standard" | "free";
  };
  papers?: PaperRecord[];
  usage?: UsageTotals;
  discoveryProgress?: DiscoveryProgress & { signature: string };
  analysis: Analysis | null;
  discoverySignature: string;
  extractionProgress?: ExtractionProgress & { signature: string };
  discoveryCoverage?: {
    batches: number;
    discovered: number;
    omitted: string[];
  };
}
// Explicit fields only: provider keys are never part of a draft.
export function safeDraft(d: Draft): Draft {
  return structuredClone({
    id: d.id,
    name: d.name,
    updatedAt: d.updatedAt,
    status: d.status,
    step: d.step,
    focus: d.focus,
    keywords: d.keywords,
    document: d.document
      ? {
          name: d.document.name,
          pages: d.document.pages,
          characters: d.document.characters,
          warnings: [...d.document.warnings],
          papers: d.document.papers ? safePapers(d.document.papers) : undefined,
          passages: d.document.passages.map((p) => ({
            id: p.id,
            paperId: p.paperId,
            paperName: p.paperName,
            text: p.text,
            page: p.page,
            paragraph: p.paragraph,
            section: p.section,
            terms: [...p.terms],
          })),
        }
      : null,
    concepts: d.concepts.map((c) => ({
      label: c.label,
      type: c.type,
      aliases: [...c.aliases],
      selected: c.selected,
    })),
    options: {
      maxNodes: d.options.maxNodes,
      maxEdges: d.options.maxEdges,
      contextTokens: d.options.contextTokens,
      includeInferred: d.options.includeInferred,
    },
    provider: {
      provider: d.provider.provider,
      model: d.provider.model,
      endpoint: d.provider.endpoint,
      billing: d.provider.billing,
    },
    analysis: d.analysis ? safeAnalysis(d.analysis) : null,
    papers: d.papers ? safePapers(d.papers) : undefined,
    usage: d.usage ? safeUsage(d.usage) : undefined,
    discoveryProgress: d.discoveryProgress
      ? {
          signature: d.discoveryProgress.signature,
          completed: [...d.discoveryProgress.completed],
          concepts: d.discoveryProgress.concepts.map((c) => ({
            label: c.label,
            type: c.type,
            aliases: [...c.aliases],
            selected: c.selected,
          })),
        }
      : undefined,
    discoverySignature: d.discoverySignature,
    extractionProgress: d.extractionProgress
      ? {
          signature: d.extractionProgress.signature,
          completed: [...d.extractionProgress.completed],
          rejected: d.extractionProgress.rejected,
          edges: d.extractionProgress.edges.map((e) => ({
            id: e.id,
            paperId: e.paperId,
            paperName: e.paperName,
            source: e.source,
            target: e.target,
            relationship: e.relationship,
            confidence: e.confidence,
            evidence: e.evidence,
            passageId: e.passageId,
            page: e.page,
            paragraph: e.paragraph,
            section: e.section,
            kind: e.kind,
            explanation: e.explanation,
          })),
        }
      : undefined,
    discoveryCoverage: d.discoveryCoverage
      ? {
          batches: d.discoveryCoverage.batches,
          discovered: d.discoveryCoverage.discovered,
          omitted: [...d.discoveryCoverage.omitted],
        }
      : undefined,
  });
}
async function store<T>(
  mode: IDBTransactionMode,
  operation: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("evidence-atlas", 2);
    request.onupgradeneeded = () => {
      for (const name of ["analyses", "drafts"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error("Unable to save this draft. Browser storage is unavailable."),
      );
    request.onblocked = () =>
      reject(
        new Error("Close older Evidence Atlas tabs to enable draft storage."),
      );
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", mode),
      req = operation(tx.objectStore("drafts"));
    let value: T;
    req.onsuccess = () => {
      value = req.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "Draft could not be saved. Keep this tab open and export your graph.",
        ),
      );
    };
  });
}
export const drafts = {
  list: async () =>
    ((await store("readonly", (s) => s.getAll())) as Draft[]).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
  save: (d: Draft) => store("readwrite", (s) => s.put(safeDraft(d))),
  remove: (id: string) => store("readwrite", (s) => s.delete(id)),
  clear: () => store("readwrite", (s) => s.clear()),
};
