import type { KnowledgeGraph } from "../types";
const clean = (value: string, max: number) => value.trim().slice(0, max);
export function editNode(
  graph: KnowledgeGraph,
  id: string,
  label: string,
  type: string,
  color: string,
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
      n.id === id ? { ...n, label, type, color, edited: true } : n,
    ),
  };
}
export function deleteNode(graph: KnowledgeGraph, id: string): KnowledgeGraph {
  return {
    nodes: graph.nodes.filter((n) => n.id !== id),
    edges: graph.edges.filter((e) => e.source !== id && e.target !== id),
  };
}
export function editRelationship(
  graph: KnowledgeGraph,
  id: string,
  relationship: string,
  explanation: string,
): KnowledgeGraph {
  const edge = graph.edges.find((e) => e.id === id);
  if (!edge) throw new Error("Relationship no longer exists.");
  const label = clean(relationship, 100).replace(/\s+/g, "_");
  if (!label) throw new Error("Enter a relationship label.");
  if (
    graph.edges.some(
      (e) =>
        e.id !== id &&
        e.source === edge.source &&
        e.target === edge.target &&
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
            relationship: label,
            explanation: clean(explanation, 1200),
            edited: true,
          }
        : e,
    ),
  };
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
