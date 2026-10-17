import { defineConfig } from "@playwright/test";

// Every capture is composed for the 1920×1080 stage (SPEC §11.7).
// PREVIEW_PORT lets a second agent run tests in parallel on another port.
const PORT = Number(process.env.PREVIEW_PORT ?? 4173);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: "npm run build && npm run preview",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
