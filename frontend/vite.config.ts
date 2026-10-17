/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Ports are overridable so two agents can run dev/preview/Playwright side by side (see docs/FRONTEND_CONVENTIONS.md).
const DEV_PORT = Number(process.env.DEV_PORT ?? 5173);
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT ?? 4173);

export default defineConfig({
  plugins: [react()],
  server: { port: DEV_PORT, strictPort: true },
  preview: { port: PREVIEW_PORT, strictPort: true },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/**/*.test.ts"],
    environment: "node",
  },
});
