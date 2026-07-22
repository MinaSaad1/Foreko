import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The real-model gate.
 *
 * The default e2e run sets FOREKO_FAKE_MODELS so every fit returns instantly.
 * That makes the journey deterministic, and it also removes the two conditions
 * under which the job event stream failed in a shipped build: real fits that
 * occupy the process, and enough events to leave the browser behind the
 * producer. A green run there said nothing about either.
 *
 * This config runs the same app with real models and a dataset large enough to
 * produce a backlog. It is slower and it is meant to be: an installer should
 * not be published until this passes.
 *
 * TimesFM is excluded by default because CI has no cached checkpoint and would
 * download one. Set FOREKO_E2E_MODELS to include it on a machine that has it.
 */

const storageDir =
  process.env.FOREKO_E2E_STORAGE_DIR ??
  fs.mkdtempSync(path.join(os.tmpdir(), "foreko-e2e-heavy-"));

// Point this at a backend that is already running and the gate drives that
// instead of starting one from source. That is how the built artifact gets
// tested: run the installer's own foreko-backend.exe, which serves the bundled
// frontend itself, and aim the same journey at it. Source passing says nothing
// about what PyInstaller froze.
const externalBaseUrl = process.env.FOREKO_E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /real-models\.spec\.ts/,
  timeout: 900_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "./e2e/artifacts-heavy",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:5175",
    headless: true,
    trace: "on",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  webServer: externalBaseUrl ? undefined : [
    {
      command: "uv run uvicorn foreko.main:app --port 8002 --app-dir app/backend",
      port: 8002,
      cwd: path.resolve(here, "..", ".."),
      reuseExistingServer: false,
      timeout: 300_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        // Deliberately no FOREKO_FAKE_MODELS. That is the whole point.
        //
        // Preload is left on, as it is for a real install. With it off the
        // registry never leaves "loading", the app sits behind its setup
        // splash forever, and the run would be testing a configuration nobody
        // ships. The consequence is that this gate needs the TimesFM
        // checkpoint present in FOREKO_E2E_STORAGE_DIR/models, or it will
        // fetch one on first run.
        FOREKO_STORAGE_DIR: storageDir,
      },
    },
    {
      command: "npm run dev -- --port 5175",
      url: "http://localhost:5175",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { FOREKO_API_TARGET: "http://localhost:8002" },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
