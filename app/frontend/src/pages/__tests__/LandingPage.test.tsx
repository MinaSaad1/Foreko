import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LandingPage } from "../LandingPage";
import type { ProjectSummary } from "@/types/project";

function project(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    schema_version: 1,
    id: "p1",
    name: "MEA Demand Plan",
    description: "",
    dataset_id: "data-1",
    status: "ready",
    current_revision: 3,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-02T00:00:00Z",
    archived_at: null,
    is_archived: false,
    ...overrides,
  };
}

function stubProjects(body: ProjectSummary[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

function renderLanding() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => stubProjects([]));
afterEach(() => vi.unstubAllGlobals());

describe("LandingPage projects section", () => {
  it("surfaces the project workflow on the home page", async () => {
    // The home page shipped with no route to Projects at all, so a user
    // landing here had no way to reach the V2 workflow.
    stubProjects([project({})]);
    renderLanding();

    expect(await screen.findByText("MEA Demand Plan")).toBeVisible();
    expect(screen.getByRole("link", { name: /all projects/i })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("links a project to its own overview", async () => {
    stubProjects([project({ id: "p9", name: "Retail Revenue" })]);
    renderLanding();

    expect(await screen.findByRole("link", { name: /Retail Revenue/ })).toHaveAttribute(
      "href",
      "/projects/p9",
    );
  });

  it("invites a first project rather than showing an empty list", async () => {
    renderLanding();

    expect(await screen.findByText("No projects yet")).toBeVisible();
    expect(screen.getByRole("link", { name: /new project/i })).toHaveAttribute(
      "href",
      "/projects",
    );
  });

  it("caps the list and says how many are left", async () => {
    stubProjects(
      Array.from({ length: 7 }, (_, i) =>
        project({ id: `p${i}`, name: `Project ${i}` }),
      ),
    );
    renderLanding();

    expect(await screen.findByText("Project 0")).toBeVisible();
    expect(screen.getByText("Project 3")).toBeVisible();
    // Capped at 4, so the fifth must not render.
    expect(screen.queryByText("Project 4")).not.toBeInTheDocument();
    expect(screen.getByText(/3 more on the projects page/i)).toBeVisible();
  });

  it("keeps projects above the feature tiles", async () => {
    stubProjects([project({})]);
    renderLanding();
    await screen.findByText("MEA Demand Plan");

    // Option C: the hero stays, but the work outranks the destinations.
    const headings = Array.from(
      document.querySelectorAll("h1, h2"),
    ).map((h) => h.textContent?.trim());

    expect(headings.indexOf("Your projects")).toBeGreaterThan(-1);
    expect(headings.indexOf("Your projects")).toBeLessThan(
      headings.indexOf("What Foreko does"),
    );
  });

  it("reports a failure to load projects instead of rendering nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    renderLanding();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not load your projects/i)).toBeVisible();
  });
});
