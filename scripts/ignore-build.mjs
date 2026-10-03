import { spawnSync } from "node:child_process";

// Netlify uses exit 0 to skip a build and exit 1 to build.
const { CACHED_COMMIT_REF: previous, COMMIT_REF: current } = process.env;
if (!previous || !current) process.exit(1);
const result = spawnSync("git", [
  "diff",
  "--quiet",
  previous,
  current,
  "--",
  "index.html",
  "package.json",
  "package-lock.json",
  "netlify.toml",
  "vite.config.ts",
  "tsconfig.json",
  "src",
  "public",
  "guide",
  "scripts/build-viewer.mjs",
  "scripts/dependency-notices.mjs",
  "scripts/check-seo.mjs",
  "scripts/ignore-build.mjs",
]);
// Missing history or Git errors must not suppress a deployment.
process.exit(result.status === 0 ? 0 : 1);
