import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectSetupPage } from "../ProjectSetupPage";
import type { ProjectDetail } from "@/types/project";

// A project created from the library has no revision, which used to leave every
// stage with a disabled button and no explanation. These tests pin the way out.

const UNCONFIGURED: ProjectDetail = {
  schema_version: 1,
  id: "p1",
  name: "MEA Demand Plan",
  description: "",
  dataset_id: "data-1",
  status: "draft",
  current_revision: 0,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  archived_at: null,
  is_archived: false,
  config: null,
};

const PREVIEW = {
  id: "data-1",
  filename: "sales.csv",
  columns: [
    { name: "month", dtype: "datetime", example_values: ["2024-01-01"], null_fraction: 0 },
    { name: "sales", dtype: "numeric", example_values: ["120"], null_fraction: 0 },
  ],
  row_count: 36,
  first_rows: [],
};

let posted: { url: string; body: unknown }[] = [];

function stubApi(overrides: { revisionStatus?: number; revisionDetail?: string } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });

      if (init?.method === "POST" && url.endsWith("/revisions")) {
        posted.push({ url, body: JSON.parse(String(init.body)) });
        if (overrides.revisionStatus && overrides.revisionStatus >= 400) {
          return json({ detail: overrides.revisionDetail }, overrides.revisionStatus);
        }
        return json({ id: "r1", project_id: "p1", revision_no: 1 }, 201);
      }
      if (url.includes("/datasets/data-1/preview")) return json(PREVIEW);
      if (url.includes("/projects/p1")) return json(UNCONFIGURED);
      return json({});
    }),
  );
}

function renderSetup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/projects/p1/setup"]}>
        <Routes>
          <Route path="/projects/:projectId/setup" element={<ProjectSetupPage />} />
          <Route
            path="/projects/:projectId/studio/:stage"
            element={<p>studio landing</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  posted = [];
  stubApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectSetupPage", () => {
  it("saves a first revision with the mapped columns and hands over to Prepare", async () => {
    renderSetup();

    const save = await screen.findByRole("button", { name: /save and continue/i });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    await waitFor(() => expect(posted).toHaveLength(1));
    const config = posted[0].body as Record<string, unknown>;
    expect(config.mapping).toMatchObject({ date_col: "month", value_col: "sales" });
    expect(config.horizon).toBe(12);
    expect(config.candidate_models).toContain("seasonal_naive");
    expect(config.preparation_steps).toEqual([]);

    expect(await screen.findByText("studio landing")).toBeVisible();
  });

  it("refuses an out-of-range horizon and says why rather than dimming the button", async () => {
    renderSetup();

    const horizon = await screen.findByRole("spinbutton", { name: /horizon/i });
    await userEvent.clear(horizon);
    await userEvent.type(horizon, "0");

    expect(
      screen.getByText(/horizon must be a whole number between 1 and 1000/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /save and continue/i })).toBeDisabled();
    expect(posted).toHaveLength(0);
  });

  it("surfaces a rejected revision instead of silently staying put", async () => {
    stubApi({ revisionStatus: 422, revisionDetail: "candidate_models: too short" });
    renderSetup();

    const save = await screen.findByRole("button", { name: /save and continue/i });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent(/candidate_models/i);
    expect(screen.queryByText("studio landing")).not.toBeInTheDocument();
  });
});
