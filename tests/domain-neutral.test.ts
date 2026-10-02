import { describe, expect, it } from "vitest";
import { discover, extract } from "../src/providers/extract";
import type { LLMProvider } from "../src/providers/client";
import { documentFromPages } from "../src/documents/text";
import { attachProvenance } from "../src/graph/provenance";
import { defaults } from "../src/types";
const cases = [
  {
    field: "astrophysics",
    text: "GW150914 reveals binary black hole coalescence.",
    labels: ["GW150914", "binary black hole coalescence"],
    types: ["Observation", "Physical phenomenon"],
    predicate: "reveals",
  },
  {
    field: "materials science",
    text: "Perovskite solar cells improve power conversion efficiency.",
    labels: ["Perovskite solar cells", "power conversion efficiency"],
    types: ["Device", "Metric"],
    predicate: "improves",
  },
  {
    field: "social science",
    text: "Participatory budgeting increases civic engagement.",
    labels: ["Participatory budgeting", "civic engagement"],
    types: ["Policy", "Outcome"],
    predicate: "increases",
  },
];
describe("research across disciplines", () => {
  for (const sample of cases)
    it(`retains ${sample.field} concepts, predicates and cited proof without a biological ontology`, async () => {
      const doc = documentFromPages(`${sample.field}.pdf`, [sample.text]);
      let discovery = true;
      const provider = {
        structured: async () => {
          if (discovery) {
            discovery = false;
            return {
              concepts: sample.labels.map((label, i) => ({
                label,
                type: sample.types[i],
                aliases: [],
              })),
            };
          }
          return {
            nodes: sample.labels.map((label, i) => ({
              id: `n${i}`,
              label,
              type: sample.types[i],
              aliases: [],
            })),
            edges: [
              {
                source: "n0",
                target: "n1",
                relationship: sample.predicate,
                confidence: 0.8,
                evidence: sample.text,
                passageId: doc.passages[0].id,
                kind: "stated",
                explanation:
                  "Controlled fixture for validation, not a live scientific evaluation.",
              },
            ],
          };
        },
      } as unknown as LLMProvider;
      const concepts = await discover(provider, doc.passages, [], defaults);
      expect(concepts.map((c) => c.type)).toEqual(sample.types);
      const result = await extract(provider, doc.passages, concepts, defaults);
      expect(result.graph.nodes).toHaveLength(2);
      expect(result.graph.edges).toHaveLength(1);
      expect(result.graph.edges[0].relationship).toBe(sample.predicate);
      const sources = attachProvenance(result.graph, doc, doc.passages);
      expect(sources).toHaveLength(1);
      expect(result.graph.nodes.every((n) => n.sources?.[0].page === 1)).toBe(
        true,
      );
      expect(result.graph.edges[0].evidence).toBe(sample.text);
    });
});
