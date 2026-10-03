import type { KnowledgeGraph } from "../types";
const clean = (value: string, max: number) => value.trim().slice(0, max);
export function editNode(
  graph: KnowledgeGraph,
  id: string,
  label: string,
  type: string,
  color: string,
  notes?: string,
): KnowledgeGraph {
  label = clean(label, 120);
  type = clean(type, 60);
  if (!label || !type) throw new Error("Enter a name and category.");
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Choose a valid color.");
  if (
    graph.nodes.some(
      (n) => n.id !== id && n.label.toLowerCase() === label.toLowerCase(),
    )
  )
    throw new Error("Another concept already has that name.");
  if (!graph.nodes.some((n) => n.id === id))
    throw new Error("Concept no longer exists.");
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === id
        ? {
            ...n,
            label,
            type,
            color,
            notes: notes === undefined ? n.notes : clean(notes, 4000),
            edited: true,
          }
        : n,
    ),
  };
}
export function deleteNode(graph: KnowledgeGraph, id: string): KnowledgeGraph {
  return deleteNodes(graph, [id]);
}
export function deleteNodes(
  graph: KnowledgeGraph,
  ids: string[],
): KnowledgeGraph {
  const selected = new Set(ids);
  return {
    nodes: graph.nodes.filter((n) => !selected.has(n.id)),
    edges: graph.edges.filter(
      (e) => !selected.has(e.source) && !selected.has(e.target),
    ),
  };
}
export function editRelationship(
  graph: KnowledgeGraph,
  id: string,
  relationship: string,
  explanation: string,
  source?: string,
  target?: string,
): KnowledgeGraph {
  const edge = graph.edges.find((e) => e.id === id);
  if (!edge) throw new Error("Relationship no longer exists.");
  source ||= edge.source;
  target ||= edge.target;
  validateEndpoints(graph, source, target);
  const label = clean(relationship, 100).replace(/\s+/g, "_");
  if (!label) throw new Error("Enter a relationship label.");
  if (
    graph.edges.some(
      (e) =>
        e.id !== id &&
        e.source === source &&
        e.target === target &&
        e.relationship.toLowerCase() === label.toLowerCase(),
    )
  )
    throw new Error("That relationship already exists.");
  return {
    ...graph,
    edges: graph.edges.map((e) =>
      e.id === id
        ? {
            ...e,
            source,
            target,
            relationship: label,
            explanation: clean(explanation, 1200),
            edited: true,
          }
        : e,
    ),
  };
}
function validateEndpoints(
  graph: KnowledgeGraph,
  source: string,
  target: string,
) {
  if (source === target) throw new Error("Choose two different concepts.");
  if (![source, target].every((id) => graph.nodes.some((n) => n.id === id)))
    throw new Error("Choose existing concepts for both ends.");
}
export function addNode(
  graph: KnowledgeGraph,
  label: string,
  type: string,
  color: string,
  notes = "",
): KnowledgeGraph {
  const id = `user-node-${crypto.randomUUID()}`;
  return editNode(
    {
      ...graph,
      nodes: [...graph.nodes, { id, label: "", type: "Concept", aliases: [] }],
    },
    id,
    label,
    type,
    color,
    notes,
  );
}
export function addRelationship(
  graph: KnowledgeGraph,
  source: string,
  target: string,
  relationship: string,
  explanation: string,
): KnowledgeGraph {
  validateEndpoints(graph, source, target);
  const id = `user-edge-${crypto.randomUUID()}`;
  return editRelationship(
    {
      ...graph,
      edges: [
        ...graph.edges,
        {
          id,
          source,
          target,
          relationship: "",
          explanation: "",
          confidence: 1,
          evidence: "",
          passageId: "",
          page: null,
          section: "Your connection",
          kind: "inferred",
          manual: true,
        },
      ],
    },
    id,
    relationship,
    explanation,
  );
}
export function nodeColor(index: number): string {
  const hue = ((index * 137.508 + 155) % 360) / 60,
    c = 0.42,
    x = c * (1 - Math.abs((hue % 2) - 1)),
    m = 0.45;
  const rgb =
    hue < 1
      ? [c, x, 0]
      : hue < 2
        ? [x, c, 0]
        : hue < 3
          ? [0, c, x]
          : hue < 4
            ? [0, x, c]
            : hue < 5
              ? [x, 0, c]
              : [c, 0, x];
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
