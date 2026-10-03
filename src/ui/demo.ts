import sample from "./demo-nejm.json" with { type: "json" };
import type { Analysis } from "../types";

// A saved, source-reviewed extraction. Clone it so editing the sample never
// changes the next viewer instance or its original evidence.
export function demoAnalysis(): Analysis {
  return structuredClone(sample) as Analysis;
}
