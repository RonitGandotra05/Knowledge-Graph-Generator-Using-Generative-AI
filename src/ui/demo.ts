import type { Analysis } from "../types";
export function demoAnalysis(): Analysis {
  const nodes = [
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
    "Lastly, Machine Learning (ML) was employed to find the important features related to ASD.";
  const result =
    "The results indicated nine significant features namely Sutterella, Prevotella, Blautia, Substance dependence pathway, Circulatory system pathway, Parasitic infectious disease, K02014 (TC.FEV.OM) gene, K03585 (acrA) gene, and K06147 (ABCB-BAC) gene.";
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
    evidence,
    passageId: "demo-abstract",
    page: 1,
    section: "Abstract",
    kind: "implied" as const,
    explanation:
      "Illustrative, manually curated relationship from the paper abstract. This demo is not a live AI extraction.",
  }));
  return {
    version: 1,
    id: "demo",
    name: "A closer look at the gut–brain connection",
    documentName: "Autism Biomarker Identification · illustrative demo",
    createdAt: new Date().toISOString(),
    provider: "Curated demo",
    model: "No API request",
    concepts: nodes.map((n) => ({ ...n, selected: true })),
    graph: { nodes, edges },
    settings: {
      theme: "dark",
      layout: "cose",
      nodeShape: "circle",
      physics: true,
      confidence: 0,
      hiddenTypes: [],
    },
    stats: {
      documentCharacters: 0,
      sentCharacters: 0,
      passages: 1,
      estimatedTokens: 0,
    },
    warnings: [
      "Illustrative graph curated from the supplied paper’s abstract. Not an AI-generated analysis; review scientific interpretation.",
    ],
  };
}
