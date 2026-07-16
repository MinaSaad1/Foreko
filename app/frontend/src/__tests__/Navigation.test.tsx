import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";

function renderApp(route = "/projects") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("navigation", () => {
  it("puts Projects and Data Sources at the top level", async () => {
    renderApp();
    const forecasting = screen.getByRole("navigation", { name: /forecasting/i });
    expect(within(forecasting).getByRole("link", { name: /projects/i })).toBeVisible();
    expect(
      within(forecasting).getByRole("link", { name: /data sources/i }),
    ).toBeVisible();
  });

  it("does not label /compare as Forecast", async () => {
    // Decision D1. /compare picks a winner from one holdout using MAPE, while
    // Forecast Studio uses rolling validation with MASE. Two destinations both
    // called Forecast would disagree about the champion with no way for a user
    // to know which to believe.
    renderApp("/compare");
    const links = screen.getAllByRole("link");
    const compare = links.find((l) => l.getAttribute("href") === "/compare");
    expect(compare).toBeDefined();
    expect(compare).toHaveTextContent(/model comparison/i);
    expect(compare).not.toHaveTextContent(/^forecast$/i);
  });

  it("keeps every V1 route reachable under Advanced analysis", async () => {
    renderApp("/compare");
    const advanced = screen.getByRole("navigation", { name: /advanced analysis/i });
    for (const href of [
      "/preflight",
      "/compare",
      "/backtest",
      "/anomaly",
      "/explain",
      "/diagnostics",
      "/covariates",
      "/segments",
      "/scenarios",
      "/ops",
    ]) {
      expect(
        within(advanced).getByRole("link", { name: (_n, el) => el.getAttribute("href") === href }),
      ).toBeTruthy();
    }
  });

  it("expands Advanced analysis when the user is already inside it", async () => {
    // A bookmarked V1 route must not land in a collapsed sidebar.
    renderApp("/backtest");
    expect(
      screen.getByRole("button", { name: /advanced analysis/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses Advanced analysis on a project route so it does not compete", async () => {
    renderApp("/projects");
    const toggle = screen.getByRole("button", { name: /advanced analysis/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
