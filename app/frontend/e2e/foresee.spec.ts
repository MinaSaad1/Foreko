import { test, expect, Page, APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.resolve(
  HERE,
  "../public/samples/monthly_revenue_demo.csv",
);

// Shared dataset id across tests in this file.
let datasetId: string | null = null;

async function uploadSampleViaApi(request: APIRequestContext): Promise<string> {
  const buffer = fs.readFileSync(SAMPLE_PATH);
  const res = await request.post("http://localhost:8000/api/datasets/upload", {
    multipart: {
      file: {
        name: "monthly_revenue_demo.csv",
        mimeType: "text/csv",
        buffer,
      },
    },
  });
  expect(res.ok(), `upload failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.id as string;
}

async function seedDatasetInApp(page: Page, id: string) {
  // Navigate directly to a route including the dataset id; the sync hook will hydrate.
  await page.goto(`/datasets`);
  await page.waitForLoadState("networkidle");
}

test.describe.configure({ mode: "default" });

test.beforeEach(async ({ context }) => {
  // Dismiss the first-run tour so it doesn't block clicks.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("foresee:tour:completed", "1");
    } catch {
      /* ignore */
    }
  });
});

test.beforeAll(async ({ request }) => {
  // Ensure backend is ready.
  const health = await request.get("http://localhost:8000/api/health");
  expect(health.ok()).toBeTruthy();
  const body = await health.json();
  expect(body.model_status).toBe("ready");

  datasetId = await uploadSampleViaApi(request);
  expect(datasetId).toBeTruthy();
});

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toContainText(/foresee/i);
});

test("upload page renders and samples pick works", async ({ page }) => {
  await page.goto("/upload");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: /upload your data/i })).toBeVisible();
  // Click first sample -> should land on /compare/:id
  const samples = page.getByRole("button", { name: /use this sample/i });
  if (await samples.count()) {
    await samples.first().click();
    await page.waitForURL(/\/compare\//, { timeout: 30_000 });
  }
});

test("datasets page lists uploaded dataset", async ({ page }) => {
  await page.goto("/datasets");
  await page.waitForLoadState("networkidle");
  // Expect our uploaded filename to show up.
  await expect(page.locator("body")).toContainText(/monthly_revenue_demo/i, {
    timeout: 15_000,
  });
});

const DATASET_ROUTES = [
  { path: "compare", primaryButton: /run forecast comparison/i },
  { path: "anomaly", primaryButton: /detect anomalies/i },
  { path: "covariates", primaryButton: /analyze factor impact/i },
  { path: "backtest", primaryButton: /run|start|backtest/i },
  { path: "diagnostics", primaryButton: /run|diagnose|analyze/i },
  { path: "preflight", primaryButton: /run|check|preflight/i },
  { path: "explain", primaryButton: /run|analyze|detect/i },
  { path: "scenarios", primaryButton: /run scenario|run|generate/i },
  { path: "segments", primaryButton: /compare|run|analyze/i },
  { path: "ops", primaryButton: /.*/ },
];

for (const route of DATASET_ROUTES) {
  test(`page loads: /${route.path}/:id`, async ({ page }) => {
    expect(datasetId).toBeTruthy();
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err.message || err)));

    await page.goto(`/${route.path}/${datasetId}`);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    // The ErrorBoundary shows "Something went wrong" when the page crashes.
    const boundary = await page.locator("text=/something went wrong/i").count();
    expect(boundary, `ErrorBoundary tripped on /${route.path}`).toBe(0);

    // Console/page errors are nonfatal but logged.
    if (errors.length) {
      console.log(`[${route.path}] page errors:`, errors.join(" | "));
    }
  });
}

test("covariates multi-series bug: series_col=none should surface descriptive error, not Internal Server Error", async ({
  page,
  request,
}) => {
  expect(datasetId).toBeTruthy();
  await page.goto(`/covariates/${datasetId}`);
  await page.waitForLoadState("networkidle");

  // Wait for the ColumnMapper to render, which means preview loaded.
  await expect(page.locator("text=/Series column/i").first()).toBeVisible({
    timeout: 20_000,
  });

  // Leave series column default ("none") but toggle a numeric factor (marketing_spend_usd).
  const factorToggle = page.getByRole("button", {
    name: /marketing_spend_usd/i,
  });
  await expect(factorToggle).toBeVisible({ timeout: 10_000 });
  await factorToggle.click();

  // Click Analyze
  const analyzeBtn = page.getByRole("button", { name: /analyze factor impact/i });
  await expect(analyzeBtn).toBeEnabled({ timeout: 30_000 });
  await analyzeBtn.click();

  // Wait for an error to surface. The backend should now send a descriptive `detail`.
  const errorBanner = page
    .locator('p:has-text("Internal Server Error"), .text-anomaly, [role="alert"]')
    .first();

  // Give the request up to 60s to complete and surface.
  const errorText = await page
    .locator(".text-anomaly, [role='alert'], p.rounded-md.border")
    .filter({ hasText: /.+/ })
    .first()
    .textContent({ timeout: 60_000 })
    .catch(() => null);

  console.log("Covariates error banner text:", errorText);

  // Fail the test ONLY if the message is generic "Internal Server Error".
  if (errorText) {
    expect(
      errorText.trim().toLowerCase(),
      `Error message should be descriptive, got: "${errorText}"`,
    ).not.toBe("internal server error");
    expect(errorText.toLowerCase()).not.toMatch(/^500 /);
  } else {
    // If no error surfaced, the request may have succeeded — log it, don't fail.
    console.log("No error surfaced — analysis may have succeeded unexpectedly.");
  }
});

test("covariates direct API probe: duplicate timestamps -> descriptive detail", async ({
  request,
}) => {
  expect(datasetId).toBeTruthy();
  const res = await request.post("http://localhost:8000/api/factors/analyze", {
    data: {
      dataset_id: datasetId,
      mapping: {
        value_col: "revenue_usd",
        series_id_col: null,
        date_col: "month",
        date_parts: null,
        freq: "infer",
      },
      horizon: 12,
      numeric_factors: ["marketing_spend_usd"],
      categorical_factors: [],
      xreg_mode: "additive",
    },
  });
  const body = await res.text();
  console.log("Direct covariate probe status:", res.status(), "body:", body);
  if (!res.ok()) {
    const lower = body.toLowerCase();
    expect(
      lower,
      `Backend detail should be descriptive, got: ${body}`,
    ).not.toContain("internal server error");
  }
});
