import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataPage } from "../DataPage";
import type { DatasetSummary } from "@/types/dataset";

function dataset(overrides: Partial<DatasetSummary>): DatasetSummary {
  return {
    id: "d1",
    filename: "monthly_revenue_demo.csv",
    row_count: 144,
    uploaded_at: "2026-07-16T15:54:18Z",
    size_bytes: 4907,
    ...overrides,
  };
}

// Same file uploaded four times, plus one other file. This is the real shape:
// re-uploading is how you refresh data, and each upload is its own dataset.
const OLDEST = dataset({ id: "a", uploaded_at: "2026-07-16T15:54:18Z" });
const MIDDLE = dataset({ id: "b", uploaded_at: "2026-07-16T15:55:02Z" });
const NEWEST = dataset({ id: "c", uploaded_at: "2026-07-16T15:55:53Z" });
const OTHER = dataset({
  id: "z",
  filename: "daily_sales_demo.csv",
  row_count: 2192,
  size_bytes: 89637,
  uploaded_at: "2026-07-16T16:18:07Z",
});

function stub(list: DatasetSummary[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/datasets") ? list : [];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

function renderDataPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DataPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  stub([OLDEST, MIDDLE, NEWEST, OTHER]);
});
afterEach(() => vi.unstubAllGlobals());

describe("DataPage duplicate collapsing", () => {
  it("shows one row per file, not one per upload", async () => {
    renderDataPage();
    expect(await screen.findAllByText("monthly_revenue_demo.csv")).toHaveLength(1);
    expect(screen.getAllByText("daily_sales_demo.csv")).toHaveLength(1);
  });

  it("keeps the newest upload of a file, not the first one it saw", async () => {
    renderDataPage();
    await screen.findAllByText("monthly_revenue_demo.csv");

    // The row must be the newest copy specifically. Asserting only that one
    // row survives would pass just as happily if we kept the oldest.
    const shown = new Date(NEWEST.uploaded_at).toLocaleString();
    const dropped = new Date(OLDEST.uploaded_at).toLocaleString();
    expect(screen.getByText(shown)).toBeVisible();
    expect(screen.queryByText(dropped)).not.toBeInTheDocument();
    expect(screen.getByText(/2 older copies are hidden/i)).toBeVisible();
  });

  it("counts files, not copies", async () => {
    renderDataPage();
    await screen.findAllByText("monthly_revenue_demo.csv");
    const files = screen.getByText("Files").closest("div");
    expect(files).toHaveTextContent("2");
  });

  it("still reports every copy against storage, because they are all on disk", async () => {
    renderDataPage();
    await screen.findAllByText("monthly_revenue_demo.csv");
    // 4907 * 3 + 89637 = 104358 bytes = 101.9 KB. Hiding a row must not make
    // the disk usage look smaller than it is.
    const storage = screen.getByText("Storage on disk").closest("div");
    expect(storage).toHaveTextContent("101.9 KB");
  });

  it("can reveal the hidden copies so they remain deletable", async () => {
    renderDataPage();
    await screen.findAllByText("monthly_revenue_demo.csv");

    await userEvent.click(screen.getByRole("button", { name: /show 2 older copies/i }));
    expect(screen.getAllByText("monthly_revenue_demo.csv")).toHaveLength(3);

    await userEvent.click(screen.getByRole("button", { name: /show newest only/i }));
    expect(screen.getAllByText("monthly_revenue_demo.csv")).toHaveLength(1);
  });

  it("says nothing about copies when there are none", async () => {
    stub([OTHER]);
    renderDataPage();
    await screen.findAllByText("daily_sales_demo.csv");
    expect(screen.queryByText(/older cop/i)).not.toBeInTheDocument();
  });
});
