import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Every stage, with real models, on a dataset big enough to be honest.
 *
 * The deterministic journey in foreko-v2-project.spec.ts runs two instant
 * candidates over two folds of 72 rows: eight progress events, none of which
 * cost anything to produce. A shipped build passed that and still reported a
 * completed validation as "Lost connection to the run", because the event
 * stream only fails when the browser falls behind a producer that is really
 * working. This run produces hundreds of events from real fits.
 *
 * It also exists because Forecast, Plan, and Review had never been run against
 * real models by anything except a person, and the first person to try was a
 * user with an installer.
 */

// When the gate runs against a packaged build, the app and the API are the same
// origin: the frozen backend serves the bundled frontend itself.
const API =
  process.env.FOREKO_E2E_API ?? process.env.FOREKO_E2E_BASE_URL ?? "http://localhost:8002";

// Real fits, no stand-ins. TimesFM only where a checkpoint is already cached.
const MODELS = (
  process.env.FOREKO_E2E_MODELS ?? "lightgbm,seasonal_naive,ets,arima,prophet"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const MODEL_LABELS: Record<string, RegExp> = {
  timesfm: /^TimesFM/,
  lightgbm: /^LightGBM/,
  ets: /^ETS/,
  arima: /^ARIMA/,
  prophet: /^Prophet/,
  seasonal_naive: /^Seasonal naive/,
};

const SERIES = ["egypt", "uae", "ksa"];
const ROWS_PER_SERIES = 800;
const FOLDS = 5;
const HORIZON = 12;

function wideCsv(): Buffer {
  const lines = ["day,sales,region"];
  const start = Date.UTC(2022, 0, 1);
  SERIES.forEach((region, seriesIndex) => {
    for (let i = 0; i < ROWS_PER_SERIES; i++) {
      const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
      // Trend plus weekly seasonality plus a deterministic wobble. No RNG: a
      // failure has to be reproducible from the spec alone.
      const value =
        100 +
        seriesIndex * 40 +
        i * 0.25 +
        8 * Math.sin((2 * Math.PI * i) / 7) +
        3 * Math.sin(i);
      lines.push(`${date},${value.toFixed(2)},${region}`);
    }
  });
  return Buffer.from(lines.join("\n"), "utf-8");
}

async function seedDataset(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/api/datasets/upload`, {
    multipart: {
      file: { name: "wide_demand.csv", mimeType: "text/csv", buffer: wideCsv() },
    },
  });
  expect(res.ok(), `upload failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()).id as string;
}

/** No stage may ever report a run as lost while the backend has it. */
async function expectNoLostConnection(page: Page) {
  await expect(page.getByText(/lost connection to the run/i)).toHaveCount(0);
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("foreko:tour:completed", "1");
    } catch {
      /* ignore */
    }
  });
});

test("every stage completes with real models on a wide dataset", async ({
  page,
  request,
}) => {
  // A packaged build serves itself from 127.0.0.1, which is this machine just as
  // much as "localhost" is. Only a request to somewhere else is a finding.
  const isLocal = (url: string) =>
    url.startsWith("http://localhost") ||
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("data:") ||
    url.startsWith("blob:");

  const external: string[] = [];
  page.on("request", (req) => {
    if (!isLocal(req.url())) external.push(req.url());
  });

  const datasetId = await seedDataset(request);

  // --- Create and set up ---------------------------------------------------
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Project name").fill("Heavy Demand Plan");
  await page.getByLabel("Data source").selectOption(datasetId);
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("heading", { name: "Set up the project" })).toBeVisible();
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  const seriesField = page.locator("label").filter({ hasText: "Series column" });
  await seriesField.getByRole("button").first().click();
  await page.getByRole("option", { name: /^region/ }).click();

  await page.getByLabel("Frequency").selectOption("D");
  await page.getByLabel("Horizon").fill(String(HORIZON));
  await page.getByLabel("Folds").fill(String(FOLDS));

  for (const [id, label] of Object.entries(MODEL_LABELS)) {
    const box = page.getByRole("checkbox", { name: label });
    if (MODELS.includes(id)) await box.check();
    else await box.uncheck();
  }

  await page.getByRole("button", { name: "Save and continue" }).click();

  // --- Prepare -------------------------------------------------------------
  await expect(page.getByRole("heading", { name: "Prepare" })).toBeVisible();
  await page.getByRole("button", { name: "Add fill missing values" }).click();
  await page.getByRole("button", { name: "Run prepare" }).click();
  await expect(page.getByText("Prepare complete")).toBeVisible({ timeout: 300_000 });
  await expectNoLostConnection(page);

  // --- Validate ------------------------------------------------------------
  // The long one: every candidate, every fold, every series. This is where a
  // stream that drops its result gets caught.
  await page.getByRole("link", { name: /^validate/i }).click();
  await expect(page.getByRole("heading", { name: "Validate" })).toBeVisible();
  await page.getByRole("button", { name: "Run validation" }).click();
  await expect(page.getByText("Selected policy", { exact: true })).toBeVisible({
    timeout: 600_000,
  });
  await expectNoLostConnection(page);

  const leaderboard = page.getByRole("table").first();
  for (const region of SERIES) {
    await expect(leaderboard.getByText(region, { exact: true })).toBeVisible();
  }

  // --- Forecast ------------------------------------------------------------
  await page.getByRole("link", { name: /^forecast/i }).click();
  await expect(page.getByRole("heading", { name: "Forecast" })).toBeVisible();
  await page.getByRole("button", { name: "Run baseline forecast" }).click();
  await expect(page.getByText("Baseline complete")).toBeVisible({ timeout: 300_000 });
  await expectNoLostConnection(page);

  // --- Plan ----------------------------------------------------------------
  await page.getByRole("link", { name: /^plan/i }).click();
  await expect(page.getByRole("heading", { name: "Plan" })).toBeVisible();
  await page.getByLabel("Scenario name").fill("Price increase");
  await page.getByRole("button", { name: "Run scenario" }).click();
  await expect(page.getByText("Scenarios versus baseline")).toBeVisible({
    timeout: 300_000,
  });
  await expect(page.getByText("Price increase")).toBeVisible();
  await expectNoLostConnection(page);

  // --- Issue ---------------------------------------------------------------
  await page.getByRole("link", { name: /^forecast/i }).click();
  await page.getByRole("button", { name: "Issue this forecast" }).click();
  await page.getByRole("button", { name: "Confirm issue" }).click();
  await expect(page.getByText("Forecast issued")).toBeVisible({ timeout: 120_000 });

  // --- Review --------------------------------------------------------------
  await page.getByRole("link", { name: /^review/i }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();

  const periods: string[] = await page.evaluate(async (id) => {
    const res = await fetch(`/api/projects/${id}/issued`);
    const issued = await res.json();
    return issued[0].forecast.series[0].dates as string[];
  }, projectId);
  expect(periods.length).toBe(HORIZON);

  const actuals =
    ["day,sales,region"]
      .concat(periods.flatMap((p) => SERIES.map((r) => `${p},320,${r}`)))
      .join("\n") + "\n";
  await page.getByLabel("Import actuals").setInputFiles({
    name: "actuals.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(actuals, "utf-8"),
  });
  await expect(page.getByText("Post-issue accuracy")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Matched periods")).toBeVisible({ timeout: 120_000 });

  // --- Reload and reproduce ------------------------------------------------
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("link", { name: /prepare complete/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /validate complete/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /forecast complete/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /review complete/i })).toBeVisible();

  expect(external).toEqual([]);
});
