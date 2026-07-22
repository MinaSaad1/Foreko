import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlanStage } from "../PlanStage";
import type { ProjectDetail, WorkflowState } from "@/types/project";

// A scenario exists only after its run finishes. The page used to ask for the
// list at the moment the run started, get nothing, and never ask again: the
// stage went green while the page still said there were no scenarios. Instant
// stand-in models hid it by finishing inside the round trip, which is why the
// deterministic journey passed and a real one did not.

const PROJECT = {
  schema_version: 1,
  id: "p1",
  name: "Heavy Demand Plan",
  description: "",
  dataset_id: "data-1",
  status: "ready",
  current_revision: 1,
  created_at: "2026-07-22T00:00:00Z",
  updated_at: "2026-07-22T00:00:00Z",
  archived_at: null,
  is_archived: false,
  config: {
    mapping: { date_col: "day", value_col: "sales", series_id_col: "region" },
    frequency: "D",
    horizon: 12,
    preparation_steps: [],
    candidate_models: ["seasonal_naive"],
    folds: 5,
    primary_metric: "mase",
    covariate_roles: {},
  },
} as unknown as ProjectDetail;

const WORKFLOW = {
  project_id: "p1",
  revision: 1,
  next_stage: "plan",
  stages: {
    prepare: { stage: "prepare", status: "complete", reason: "", run_id: "r1" },
    validate: { stage: "validate", status: "complete", reason: "", run_id: "r2" },
    forecast: { stage: "forecast", status: "complete", reason: "", run_id: "r3" },
    plan: { stage: "plan", status: "ready", reason: "Ready to plan.", run_id: null },
    review: { stage: "review", status: "blocked", reason: "", run_id: null },
  },
} as unknown as WorkflowState;

class FakeEventSource {
  static latest: FakeEventSource | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.latest = this;
  }
  close() {}
}

/** Empty until the run finishes, then one scenario. The real sequence. */
let scenariosReady = false;

function renderPlan() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanStage project={PROJECT} workflow={WORKFLOW} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  scenariosReady = false;
  FakeEventSource.latest = null;
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });

      if (init?.method === "POST" && url.includes("/scenarios/run")) {
        return json({ job_id: "job-1", run_id: "run-1", status: "running" }, 202);
      }
      if (url.includes("/factor-plan")) {
        return json({ required: [], periods: [], series: [] });
      }
      if (url.includes("/scenarios")) {
        return json(
          scenariosReady
            ? [
                {
                  run_id: "run-1",
                  name: "Price increase",
                  deltas: {
                    portfolio: {
                      baseline_total: 100,
                      scenario_total: 110,
                      absolute: 10,
                      percent: 10,
                    },
                  },
                },
              ]
            : [],
        );
      }
      return json({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlanStage", () => {
  it("shows the scenario once its run finishes, not only on a reload", async () => {
    renderPlan();

    await userEvent.type(
      await screen.findByRole("textbox", { name: /scenario name/i }),
      "Price increase",
    );
    await userEvent.click(screen.getByRole("button", { name: /run scenario/i }));

    await waitFor(() => expect(FakeEventSource.latest).not.toBeNull());
    expect(screen.getByText(/no scenarios yet/i)).toBeVisible();

    // The run completes, which is the moment the scenario becomes readable.
    scenariosReady = true;
    act(() =>
      FakeEventSource.latest?.onmessage?.({
        data: JSON.stringify({ type: "done", result: { scenario: "run-1" } }),
      }),
    );

    expect(await screen.findByText("Scenarios versus baseline")).toBeVisible();
    expect(screen.getByText("Price increase")).toBeVisible();
  });
});
