import { defineConfig } from "vite";
import { resolve } from "node:path";
import { appShell } from "./src/ui/shell";

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "render-public-homepage",
      transformIndexHtml(html, context) {
        if (context.path !== "/index.html") return html;
        return html.replace(
          '<div id="app"></div>',
          `<div id="app">${appShell}</div>`,
        );
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        home: resolve("index.html"),
        guide: resolve("guide/index.html"),
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/e2e/**"] },
} as import("vite").UserConfig);
