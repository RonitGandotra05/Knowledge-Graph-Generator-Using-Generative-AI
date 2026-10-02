import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/e2e/**"] },
} as import("vite").UserConfig);
