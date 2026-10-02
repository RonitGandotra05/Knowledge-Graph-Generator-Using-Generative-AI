import { defineConfig } from "@playwright/test";
const port = process.env.ATLAS_TEST_PORT || "5173";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
  },
  workers: 1,
  reporter: "list",
});
