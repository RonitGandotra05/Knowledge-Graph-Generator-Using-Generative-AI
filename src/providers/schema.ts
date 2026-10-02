const string = { type: "string" };
export const conceptSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: string,
          type: string,
          aliases: { type: "array", items: string },
        },
        required: ["label", "type", "aliases"],
      },
    },
  },
  required: ["concepts"],
};
export const graphSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: string,
          label: string,
          type: string,
          aliases: { type: "array", items: string },
        },
        required: ["id", "label", "type", "aliases"],
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: string,
          target: string,
          relationship: string,
          confidence: { type: "number" },
          evidence: string,
          passageId: string,
          kind: { type: "string", enum: ["stated", "implied", "inferred"] },
          explanation: string,
        },
        required: [
          "source",
          "target",
          "relationship",
          "confidence",
          "evidence",
          "passageId",
          "kind",
          "explanation",
        ],
      },
    },
  },
  required: ["nodes", "edges"],
};
