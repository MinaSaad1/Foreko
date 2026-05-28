// Captures README screenshots from the running Foreko dev server.
// Usage:  node scripts/capture_screenshots.mjs
// Pre-req: backend on :8000 + frontend on :5173 + TimesFM weights cached.
//
// Strategy:
//   1. Load the bundled "daily_sales_demo" sample so every page has data.
//   2. Capture the configuration view of each analytical page first
//      (those render even before the model is loaded).
//   3. Wait for /api/health -> model_status:"ready", then trigger each
//      Run button and capture the result view.

// Resolve playwright from app/frontend/node_modules without depending on this
// directory having its own node_modules.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("../app/frontend/node_modules/playwright/index.js");
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, "..", "docs", "screenshots");
const BASE = "http://localhost:5173";

const VIEWPORT = { width: 1600, height: 1000 };

async function waitForModelReady(page, timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await page
      .evaluate(async () => {
        try {
          const res = await fetch("/api/health");
          if (!res.ok) return "error";
          const body = await res.json();
          return body.model_status;
        } catch {
          return "error";
        }
      })
      .catch(() => "error");
    if (status === "ready") return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function shot(page, name) {
  await page.waitForTimeout(700); // settle animations
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: false,
    type: "png",
  });
  console.log("  saved", name);
}

async function loadDemoSample(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  // Dismiss tour if it appears
  await page
    .locator("text=Skip tour")
    .first()
    .click({ timeout: 1500 })
    .catch(() => {});
  // Hit the "Try demo dataset" button on Landing
  const tryDemo = page.getByRole("button", { name: /try demo dataset/i });
  await tryDemo.waitFor({ state: "visible", timeout: 5_000 });
  await tryDemo.click();
  // wait until URL navigates to /compare/<id>
  await page.waitForURL(/\/compare\//, { timeout: 30_000 });
  // capture the dataset id from the URL for later page jumps
  const url = page.url();
  const m = url.match(/\/compare\/([^/]+)/);
  return m ? m[1] : null;
}

(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  // Pre-set localStorage so the tour doesn't fire
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("foreko:tour:completed", "1");
    } catch {}
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));

  console.log("> landing");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await shot(page, "01-landing");

  console.log("> loading demo sample");
  const datasetId = await loadDemoSample(page);
  if (!datasetId) throw new Error("could not load demo");
  console.log("  datasetId =", datasetId);

  // Pages that render fully without running anything (configuration views)
  const configPages = [
    { route: `/data`, name: "02-data" },
    { route: `/preflight/${datasetId}`, name: "03-preflight-config" },
    { route: `/compare/${datasetId}`, name: "04-forecast-config" },
    { route: `/backtest/${datasetId}`, name: "05-backtest-config" },
    { route: `/diagnostics/${datasetId}`, name: "06-diagnostics-config" },
    { route: `/anomaly/${datasetId}`, name: "07-anomaly-config" },
    { route: `/explain/${datasetId}`, name: "08-explain-config" },
    { route: `/covariates/${datasetId}`, name: "09-factors-config" },
    { route: `/segments/${datasetId}`, name: "10-segments-config" },
    { route: `/scenarios/${datasetId}`, name: "11-scenarios-config" },
    { route: `/ops/${datasetId}`, name: "12-operations" },
    { route: `/glossary`, name: "13-glossary" },
  ];

  for (const p of configPages) {
    console.log(">", p.name);
    await page.goto(`${BASE}${p.route}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(900);
    await shot(page, p.name);
  }

  console.log("> waiting for model to be ready (up to 4 min)");
  const ready = await waitForModelReady(page);
  if (!ready) {
    console.log("  model still loading; skipping run captures");
  } else {
    // ----- Preflight result -----
    console.log("> running preflight");
    await page.goto(`${BASE}/preflight/${datasetId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const runPre = page.getByRole("button", { name: /run preflight/i });
    if (await runPre.isVisible().catch(() => false)) {
      await runPre.click();
      await page.waitForResponse((r) => r.url().includes("/preflight/run"), { timeout: 90_000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await shot(page, "03b-preflight-result");
    }

    // ----- Forecast result -----
    console.log("> running forecast comparison");
    await page.goto(`${BASE}/compare/${datasetId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const runFc = page.getByRole("button", { name: /run forecast comparison/i });
    if (await runFc.isVisible().catch(() => false)) {
      await runFc.click();
      await page.waitForResponse((r) => r.url().includes("/comparison/run"), { timeout: 120_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await shot(page, "04b-forecast-result");
    }

    // ----- Anomaly result -----
    console.log("> running anomaly detection");
    await page.goto(`${BASE}/anomaly/${datasetId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const runAn = page.getByRole("button", { name: /detect anomalies/i });
    if (await runAn.isVisible().catch(() => false)) {
      await runAn.click();
      await page.waitForResponse((r) => r.url().includes("/anomaly/detect"), { timeout: 120_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await shot(page, "07b-anomaly-result");
    }

    // ----- Diagnostics result -----
    console.log("> running diagnostics");
    await page.goto(`${BASE}/diagnostics/${datasetId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const runDi = page.getByRole("button", { name: /run diagnostics/i });
    if (await runDi.isVisible().catch(() => false)) {
      await runDi.click();
      await page.waitForResponse((r) => r.url().includes("/diagnostics/run"), { timeout: 120_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await shot(page, "06b-diagnostics-result");
    }

    // ----- Segments result -----
    console.log("> running segments");
    await page.goto(`${BASE}/segments/${datasetId}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const runSeg = page.getByRole("button", { name: /compare segments/i });
    if (await runSeg.isVisible().catch(() => false)) {
      await runSeg.click();
      await page.waitForResponse((r) => r.url().includes("/segments/compare"), { timeout: 120_000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await shot(page, "10b-segments-result");
    }
  }

  await browser.close();
  console.log("\ndone, screenshots in docs/screenshots/");
})().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
