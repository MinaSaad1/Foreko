import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// package.json is type: module, so __dirname does not exist here.
const here = path.dirname(fileURLToPath(import.meta.url));

// The V2 journey drives the real backend, so Playwright starts both processes.
// Each run gets an empty storage directory: design 13.4 begins the journey from
// nothing, and a leftover project from a previous run would make the test lie
// about what it created.
const storageDir =
  process.env.FOREKO_E2E_STORAGE_DIR ??
  fs.mkdtempSync(path.join(os.tmpdir(), "foreko-e2e-"));

export default defineConfig({
  testDir: "./e2e",
  // The real-model gate runs from playwright.heavy.config.ts. Running it here
  // would hand it FOREKO_FAKE_MODELS and quietly turn it back into this suite.
  testIgnore: /real-models\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "./e2e/artifacts",
  use: {
    baseURL: "http://localhost:5174",
    headless: true,
    trace: "on",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  webServer: [
    {
      command:
        "uv run uvicorn foreko.main:app --port 8001 --app-dir app/backend",
      // Deliberately not 8000, and deliberately never reused.
      //
      // A developer's backend on 8000 points at their real ~/.foreko. Reusing
      // it meant the journey created projects in real storage and scored them
      // with real models, so the run was neither isolated nor deterministic,
      // and it left the developer's data behind. This happened.
      port: 8001,
      cwd: path.resolve(here, "..", ".."),
      reuseExistingServer: false,
      // Not padding. A cold backend start imports the torch chain and took
      // roughly 70 seconds on a developer machine before it answered.
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        FOREKO_FAKE_MODELS: "1",
        FOREKO_STORAGE_DIR: storageDir,
        FOREKO_PRELOAD_MODEL: "false",
      },
    },
    {
      command: "npm run dev -- --port 5174",
      url: "http://localhost:5174",
      // Not reused either: a dev server already running proxies to the real
      // backend on 8000, which is the thing this run must not touch.
      reuseExistingServer: false,
      timeout: 120_000,
      env: { FOREKO_API_TARGET: "http://localhost:8001" },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
