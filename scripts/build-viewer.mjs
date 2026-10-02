import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("src/generated", { recursive: true });
await build({
  entryPoints: ["src/graph/viewer.ts"],
  bundle: true,
  format: "iife",
  globalName: "EvidenceAtlasViewer",
  minify: true,
  target: "es2022",
  outfile: "src/generated/viewer.js",
  legalComments: "inline",
});
// Host OCR worker and WASM engine locally; only English language data is downloaded on demand.
await mkdir("public/ocr", { recursive: true });
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  "public/ocr/worker.min.js",
);
for (const name of [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm",
])
  await copyFile(
    "node_modules/tesseract.js-core/" + name,
    "public/ocr/" + name,
  );
