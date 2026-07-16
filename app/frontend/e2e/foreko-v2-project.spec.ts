import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// package.json is type: module, so __dirname does not exist here.
const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The release gate for V2 (design 13.4).
 *
 * Drives the whole loop against a real backend with deterministic models: create
 * a project, prepare, validate, forecast, plan a scenario, issue, import
 * actuals, read accuracy, then reload and confirm the state survives without
 * rerunning anything.
 *
 * The point is not coverage. Every stage has unit tests. This asserts the parts
 * only an assembled system can be wrong about: that the stages hand off to each
 * other, that a reload reproduces the project, and that nothing here reaches the
 * network for a model.
 */

const SAMPLE = path.join(here, "..", "public", "samples", "multi_series_demand_demo.csv");

// The isolated backend this run starts, never a developer's on 8000. Seeding
// the wrong one puts test data in real storage and leaves the app reading an
// empty database.
const API = process.env.FOREKO_E2E_API ?? "http://localhost:8001";

// Seeded through the API, as the V1 spec does. The ingest UI is V1's and is
// covered there; this journey is about the project workflow that follows it.
async function seedDataset(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/api/datasets/upload`, {
    multipart: {
      file: {
        name: "multi_series_demand_demo.csv",
        mimeType: "text/csv",
        buffer: fs.readFileSync(SAMPLE),
      },
    },
  });
  expect(res.ok(), `upload failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()).id as string;
}

test.beforeEach(async ({ context }) => {
  // The first-run tour is a modal and intercepts every click. Same key the V1
  // spec uses; see src/components/Tour.tsx.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("foreko:tour:completed", "1");
    } catch {
      /* ignore */
    }
  });
});

test("forecast project survives the complete issue and review cycle", async ({
  page,
  request,
}) => {
  expect(fs.existsSync(SAMPLE)).toBe(true);

  // Requests to anywhere but localhost would mean a model download crept in.
  const external: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!url.startsWith("http://localhost") && !url.startsWith("data:")) {
      external.push(url);
    }
  });

  const datasetId = await seedDataset(request);

  // --- Create -------------------------------------------------------------
  await page.goto("/projects");
  await expect(page.getByText(/no projects yet/i)).toBeVisible();

  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Project name").fill("MEA Demand Plan");
  await page.getByLabel("Dataset id").fill(datasetId);
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("link", { name: /MEA Demand Plan/i })).toBeVisible();
  await page.getByRole("link", { name: /MEA Demand Plan/i }).click();
  await expect(page.getByRole("heading", { name: "MEA Demand Plan" })).toBeVisible();

  const projectId = page.url().split("/projects/")[1].split("/")[0];

  // Configure the revision through the API: the mapping UI is V1's job and is
  // covered elsewhere. This journey is about the project workflow.
  await page.evaluate(async (id) => {
    await fetch(`/api/projects/${id}/revisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapping: { date_col: "month", value_col: "sales", series_id_col: "region" },
        frequency: "MS",
        horizon: 3,
        preparation_steps: [{ kind: "impute", method: "linear" }],
        candidate_models: ["seasonal_naive", "ets"],
        folds: 2,
        primary_metric: "mase",
        covariate_roles: {},
      }),
    });
  }, projectId);

  // --- Prepare ------------------------------------------------------------
  await page.goto(`/projects/${projectId}/studio/prepare`);
  await expect(page.getByRole("heading", { name: "Prepare" })).toBeVisible();
  await page.getByRole("button", { name: "Run prepare" }).click();
  await expect(page.getByText("Prepare complete")).toBeVisible({ timeout: 60_000 });

  // --- Validate -----------------------------------------------------------
  await page.getByRole("link", { name: /^validate/i }).click();
  await expect(page.getByRole("heading", { name: "Validate" })).toBeVisible();
  await page.getByRole("button", { name: "Run validation" }).click();
  await expect(
    page.getByText("Selected policy", { exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  // Both series get their own champion, which is the point of per-series
  // selection.
  const leaderboard = page.getByRole("table").first();
  await expect(leaderboard.getByText("egypt")).toBeVisible();
  await expect(leaderboard.getByText("uae")).toBeVisible();

  // --- Forecast -----------------------------------------------------------
  await page.getByRole("link", { name: /^forecast/i }).click();
  await expect(page.getByRole("heading", { name: "Forecast" })).toBeVisible();
  await page.getByRole("button", { name: "Run baseline forecast" }).click();
  await expect(page.getByText("Baseline complete")).toBeVisible({ timeout: 60_000 });

  // --- Plan ---------------------------------------------------------------
  await page.getByRole("link", { name: /^plan/i }).click();
  await expect(page.getByRole("heading", { name: "Plan" })).toBeVisible();
  await page.getByLabel("Scenario name").fill("Price increase");
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByText("Scenarios versus baseline")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Price increase")).toBeVisible();

  // --- Issue --------------------------------------------------------------
  await page.getByRole("link", { name: /^forecast/i }).click();
  await page.getByRole("button", { name: "Issue this forecast" }).click();
  await page.getByRole("button", { name: "Confirm issue" }).click();
  await expect(page.getByText("Forecast issued")).toBeVisible({ timeout: 30_000 });

  // --- Review -------------------------------------------------------------
  await page.getByRole("link", { name: /^review/i }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(page.getByText(/forecast issued/i).first()).toBeVisible();

  // Score the issued forecast against actuals for the periods it covered.
  const periods: string[] = await page.evaluate(async (id) => {
    const res = await fetch(`/api/projects/${id}/issued`);
    const issued = await res.json();
    return issued[0].forecast.series[0].dates as string[];
  }, projectId);
  expect(periods.length).toBe(3);

  const actualsPath = path.join(here, "artifacts", "e2e-actuals.csv");
  fs.mkdirSync(path.dirname(actualsPath), { recursive: true });
  fs.writeFileSync(
    actualsPath,
    ["month,sales,region"]
      .concat(periods.flatMap((p) => [`${p},190,egypt`, `${p},240,uae`]))
      .join("\n") + "\n",
    "utf-8",
  );

  await page.getByLabel("Import actuals").setInputFiles(actualsPath);
  await expect(page.getByText("Post-issue accuracy")).toBeVisible();
  await expect(page.getByText("Matched periods")).toBeVisible({ timeout: 30_000 });

  // Backtest evidence and post-issue accuracy must stay distinguishable
  // (design 14).
  await expect(page.getByRole("heading", { name: "Backtest evidence" })).toBeVisible();
  await expect(page.getByText(/not a measure of the issued forecast/i)).toBeVisible();

  // --- Reload and reproduce ----------------------------------------------
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(page.getByText(/forecast issued/i).first()).toBeVisible();
  await expect(page.getByText("Matched periods")).toBeVisible({ timeout: 30_000 });

  // The stepper reports the whole workflow as done without rerunning anything.
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("link", { name: /prepare complete/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /validate complete/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /forecast complete/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /review complete/i })).toBeVisible();

  // Design 13.5: no network request beyond the local app.
  expect(external).toEqual([]);
});
