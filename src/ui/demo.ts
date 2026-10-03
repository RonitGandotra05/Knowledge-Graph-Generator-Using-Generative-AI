import sampleGeometry from "./demo-pdf-geometry.json" with { type: "json" };
import type { Analysis, Passage, GraphNode } from "../types";
import { attachProvenance } from "../graph/provenance";
export function demoAnalysis(): Analysis {
  const nodes: GraphNode[] = [
    ["asd", "Autism spectrum disorder", "Condition"],
    ["microbiome", "Gut microbiome", "System"],
    ["dysbiosis", "Microbial dysbiosis", "Process"],
    ["ml", "Machine learning", "Method"],
    ["biomarkers", "Microbial biomarkers", "Outcome"],
    ["sutterella", "Sutterella", "Organism"],
    ["prevotella", "Prevotella", "Organism"],
    ["blautia", "Blautia", "Organism"],
    ["genes", "Gene features", "Measurement"],
  ].map(([id, label, type]) => ({ id, label, type, aliases: [] }));
  const intro =
    "Introduction and Aim: Autism Spectrum Disorder (ASD) is a multifaceted neurodevelopmental disorder with complicated origins, and recent research points to a possible connection between dysbiosis of the gut microbiome and the pathophysiology of ASD.";
  const method =
    "Materials and Methods: In the present study, gut microbiome samples from public repositories (NCBI BioProject IDs: PRJNA185491 and PRJNA642975) were meta-analyzed using an integrated computational methodology. The gut microbiome 16S rRNA samples (n = 98) were subjected to taxonomic classification, functional profiling, statistical analysis as well as LEfSE and T-test analysis to find microbial biomarkers. Lastly, Machine Learning (ML) was employed to find the important features related to ASD.";
  const result =
    "The results indicated nine significant features namely Sutterella, Prevotella, Blautia, Substance dependence pathway, Circulatory system pathway, Parasitic infectious disease, K02014 (TC.FEV.OM) gene, K03585 (acrA) gene, and K06147 (ABCB-BAC) gene.";
  const sources: Passage[] = [intro, method, result].map((text, i) => ({
    id: `demo-abstract-${i + 1}`,
    text,
    page: 1,
    section: [
      "Abstract · Introduction and Aim",
      "Abstract · Materials and Methods",
      "Abstract · Results",
    ][i],
    paragraph: i + 1,
    paperId: "demo-paper",
    paperName: "05v1.pdf",
    terms: [],
    pdfLines: sampleGeometry.passages[i],
  }));
  nodes.find((n) => n.id === "asd")!.aliases = ["ASD"];
  nodes.find((n) => n.id === "dysbiosis")!.aliases = ["dysbiosis"];
  const edges = [
    ["dysbiosis", "microbiome", "occurs_in", intro],
    ["dysbiosis", "asd", "possibly_associated_with", intro],
    ["ml", "biomarkers", "identifies", method],
    ["biomarkers", "asd", "related_to", method],
    ["sutterella", "biomarkers", "reported_as", result],
    ["prevotella", "biomarkers", "reported_as", result],
    ["blautia", "biomarkers", "reported_as", result],
    ["genes", "biomarkers", "reported_as", result],
  ].map(([source, target, relationship, evidence], i) => ({
    id: "e" + i,
    source,
    target,
    relationship,
    confidence: 0.85,
    evidence:
      evidence === method
        ? method.slice(method.indexOf("and T-test analysis"))
        : evidence,
    passageId: sources.find((p) => p.text === evidence)!.id,
    page: 1,
    section: "Abstract",
    kind: "implied" as const,
    explanation:
      "Illustrative, manually curated relationship from the paper abstract. This demo is not a live AI extraction.",
  }));
  const graph = { nodes, edges };
  attachProvenance(
    graph,
    {
      name: "05v1.pdf",
      pages: 14,
      characters: sources.reduce((sum, p) => sum + p.text.length, 0),
      passages: sources,
      warnings: [],
    },
    sources,
  );
  // This aggregate concept represents the three named gene features in Results.
  nodes.find((n) => n.id === "genes")!.sources = [
    {
      passageId: sources[2].id,
      paperId: "demo-paper",
      paperName: "05v1.pdf",
      page: 1,
      paragraph: 3,
      section: sources[2].section,
      quote: result,
    },
  ];
  return {
    version: 1,
    id: "demo",
    name: "A closer look at the gut–brain connection",
    documentName: "05v1.pdf",
    papers: [
      {
        id: "demo-paper",
        name: "05v1.pdf",
        status: "ready",
        pages: 14,
        characters: sources.reduce((sum, p) => sum + p.text.length, 0),
        ocrPages: [],
        skippedPages: [],
        citation:
          "Narang B, Sharma P, Kulshrestha S, Gandotra R, Pai SS, Syed M, Narad P, Sengupta A. Autism Biomarker Identification using an Integrative Systems Biology and Machine Learning Approach Highlighting TC.FEV.OM, acrA, and ABCB-BAC Genes in Gut Microbiome Analysis. Biomedicine. 2024;44(2):190–203.",
        doi: "10.51248/v44i2.01",
        fingerprint: sampleGeometry.fingerprint,
      },
    ],
    sources,
    createdAt: new Date().toISOString(),
    provider: "Curated demo",
    model: "No API request",
    concepts: nodes.map((n) => ({ ...n, selected: true })),
    graph,
    settings: {
      theme: "dark",
      layout: "cose",
      nodeShape: "circle",
      physics: true,
      confidence: 0,
      hiddenTypes: [],
    },
    stats: {
      documentCharacters: sources.reduce((sum, p) => sum + p.text.length, 0),
      sentCharacters: 0,
      passages: sources.length,
      estimatedTokens: 0,
    },
    warnings: [
      "Illustrative graph curated from the supplied paper’s abstract. Not an AI-generated analysis; review scientific interpretation.",
    ],
  };
}
