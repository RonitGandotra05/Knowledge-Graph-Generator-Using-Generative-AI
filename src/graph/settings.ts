import type { GraphSettings } from "../types";

export const appearanceDefaults = {
  graphScale: 1,
  nodeSize: 1,
  nodeFontSize: 15,
  edgeFontSize: 11,
  edgeLength: 70,
  showEdgeLabels: true,
};

// Shared by the live editor and imports, including untrusted JSON files.
export function appearanceSettings(settings: Partial<GraphSettings>) {
  const bounded = (
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value))
      : fallback;
  return {
    graphScale: bounded(settings.graphScale, 1, 0.1, 1.6),
    nodeSize: bounded(settings.nodeSize, 1, 0.15, 1.6),
    nodeFontSize: bounded(settings.nodeFontSize, 15, 4, 24),
    edgeFontSize: bounded(settings.edgeFontSize, 11, 4, 18),
    edgeLength: bounded(settings.edgeLength, 70, 0, 240),
    showEdgeLabels: settings.showEdgeLabels !== false,
    nodeShape: (["circle", "card", "ellipse", "diamond"].includes(
      settings.nodeShape || "",
    )
      ? settings.nodeShape
      : "card") as NonNullable<GraphSettings["nodeShape"]>,
  };
}
