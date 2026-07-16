import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProjectsPage } from "../ProjectsPage";
import { useProjectStore } from "@/stores/projectStore";
import type { ProjectSummary } from "@/types/project";

function project(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    schema_version: 1,
    id: "p1",
    name: "MEA Demand Plan",
    description: "",
    dataset_id: "data-1",
    status: "ready",
    current_revision: 1,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-02T00:00:00Z",
    archived_at: null,
    is_archived: false,
    ...overrides,
  };
}

const ACTIVE = project({});
const ARCHIVED = project({
  id: "p2",
  name: "Archived Sales Plan",
  archived_at: "2026-07-03T00:00:00Z",
  is_archived: true,
});

function renderProjectsRoute() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useProjectStore.setState({ showArchived: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // The archived filter is a server query, not a client-side filter, so the
      // test asserts the page asks for the right thing.
      const includeArchived = url.includes("include_archived=true");
      const body = includeArchived ? [ACTIVE, ARCHIVED] : [ACTIVE];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectsPage", () => {
  it("renders projects and preserves archived projects behind the filter", async () => {
    renderProjectsRoute();
    expect(await screen.findByText("MEA Demand Plan")).toBeVisible();
    expect(screen.queryByText("Archived Sales Plan")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /show archived/i }));
    expect(await screen.findByText("Archived Sales Plan")).toBeVisible();
  });

  it("links each project to its overview", async () => {
    renderProjectsRoute();
    const link = await screen.findByRole("link", { name: /MEA Demand Plan/i });
    expect(link).toHaveAttribute("href", "/projects/p1");
  });

  it("shows an empty state that explains what a project is for", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("[]", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    renderProjectsRoute();
    expect(await screen.findByText(/no projects yet/i)).toBeVisible();
    expect(screen.getAllByRole("button", { name: /new project/i }).length).toBeGreaterThan(0);
  });

  it("surfaces a load failure instead of showing an empty library", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "database is locked" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    renderProjectsRoute();
    // An error rendered as "no projects" would tell the user their work is gone.
    expect(await screen.findByRole("alert")).toHaveTextContent(/database is locked/i);
    expect(screen.queryByText(/no projects yet/i)).not.toBeInTheDocument();
  });
});
