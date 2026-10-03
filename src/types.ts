export interface PaperRecord {
  id: string;
  name: string;
  citation?: string;
  doi?: string;
  fingerprint?: string;
  status: "ready" | "partial" | "failed";
  pages: number;
  characters: number;
  ocrPages: number[];
  skippedPages: number[];
  error?: string;
}
export interface UsageTotals {
  calls: number;
  reportedCalls: number;
  unknownCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  unreportedTokenCeiling: number;
  elapsedMs: number;
  requestDurationMs: number;
  estimatedCostUSD: number | null;
  pricingDate: string;
  billing: "standard" | "free";
}
export interface PDFLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Passage {
  paperId?: string;
  paperName?: string;
  id: string;
  text: string;
  page: number | null;
  section: string;
  paragraph: number;
  terms: string[];
  pdfLines?: PDFLine[];
}
export interface ResearchDocument {
  name: string;
  pages: number;
  characters: number;
  passages: Passage[];
  warnings: string[];
  papers?: PaperRecord[];
  ocrPages?: number[];
  skippedPages?: number[];
}
export interface Concept {
  label: string;
  type: string;
  aliases: string[];
  selected: boolean;
}
export interface SourceReference {
  paperId?: string;
  paperName?: string;
  passageId: string;
  page: number | null;
  paragraph: number;
  section: string;
  quote: string;
}
export interface GraphNode {
  id: string;
  label: string;
  type: string;
  aliases: string[];
  sources?: SourceReference[];
  color?: string;
  edited?: boolean;
  notes?: string;
}
export type EvidenceKind = "stated" | "implied" | "inferred";
export interface GraphEdge {
  manual?: boolean;
  paperId?: string;
  paperName?: string;
  id: string;
  source: string;
  target: string;
  relationship: string;
  confidence: number;
  evidence: string;
  passageId: string;
  page: number | null;
  section: string;
  kind: EvidenceKind;
  explanation: string;
  paragraph?: number;
  edited?: boolean;
}
export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface GraphSettings {
  theme: "dark" | "light";
  layout: string;
  nodeShape?: "circle" | "card" | "ellipse" | "diamond";
  graphScale?: number;
  nodeSize?: number;
  nodeFontSize?: number;
  edgeFontSize?: number;
  edgeLength?: number;
  showEdgeLabels?: boolean;
  physics?: boolean;
  confidence: number;
  hiddenTypes: string[];
  positions?: Record<string, { x: number; y: number }>;
}
export interface Analysis {
  version: 1;
  id: string;
  name: string;
  documentName: string;
  createdAt: string;
  provider: string;
  model: string;
  concepts: Concept[];
  graph: KnowledgeGraph;
  settings: GraphSettings;
  stats: {
    documentCharacters: number;
    sentCharacters: number;
    passages: number;
    estimatedTokens: number;
  };
  warnings: string[];
  sources?: Passage[];
  papers?: PaperRecord[];
  usage?: UsageTotals;
  state?: "building" | "paused" | "complete";
  coverage?: {
    discoveryBatches: number;
    relationshipBatches: number;
    reviewedPassages: number;
    totalPassages: number;
    discoveredConcepts: number;
    omittedConcepts: string[];
  };
}
export interface ExtractionOptions {
  maxNodes: number;
  maxEdges: number;
  contextTokens: number;
  includeInferred: boolean;
}
export const defaults: ExtractionOptions = {
  maxNodes: 150,
  maxEdges: 500,
  contextTokens: 6000,
  includeInferred: false,
};
