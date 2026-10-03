import { build } from "esbuild";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
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
  plugins: [
    {
      name: "inline-pdf-worker",
      setup(build) {
        build.onResolve({ filter: /pdf\.worker\.min\.mjs\?raw$/ }, (args) => ({
          path: require.resolve(args.path.replace(/\?raw$/, "")),
          namespace: "worker-source",
        }));
        build.onLoad(
          { filter: /.*/, namespace: "worker-source" },
          async (args) => ({
            contents: `export default ${JSON.stringify(await readFile(args.path, "utf8"))}`,
            loader: "js",
          }),
        );
      },
    },
  ],
  banner: {
    js:
      "/*! Cytoscape.js\n" +
      (await readFile("node_modules/cytoscape/LICENSE", "utf8")) +
      "\n*/",
  },
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

// Ship the application terms and installed runtime dependency notices with static builds.
const { writeDependencyNotices } = await import("./dependency-notices.mjs");
await writeDependencyNotices();
