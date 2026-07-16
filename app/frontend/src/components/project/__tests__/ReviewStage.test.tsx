import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AccuracySummary } from "../AccuracySummary";
import { IssuedForecastBanner } from "../IssuedForecastBanner";
import type { AccuracyResult, IssuedForecast } from "@/types/accuracy";

function accuracy(overrides: Partial<AccuracyResult> = {}): AccuracyResult {
  return {
    schema_version: 1,
    issued_id: "i1",
    issued_at: "2026-08-15T00:00:00Z",
    matched_points: 4,
    unmatched_periods: 2,
    series: [
      {
        series_id: "egypt",
        matched_points: 4,
        metrics: {
          mase: 0.8,
          wape: 0.09,
          smape: 0.08,
          rmse: 5.1,
          bias_pct: -2.4,
          pinball_loss: 3.0,
          coverage_p10_p90: 0.75,
        },
        metric_warnings: [],
      },
    ],
    metrics: {
      mase: 0.8,
      wape: 0.09,
      smape: 0.08,
      rmse: 5.1,
      bias_pct: -2.4,
      pinball_loss: 3.0,
      coverage_p10_p90: 0.75,
    },
    metric_warnings: [],
    ...overrides,
  };
}

const ISSUED: IssuedForecast = {
  schema_version: 1,
  id: "i1",
  project_id: "p1",
  run_id: "run-abcdef123456",
  revision_no: 2,
  issued_at: "2026-08-15T00:00:00Z",
  forecast: {},
  assumptions: { price: { "2026-09-01": 12.5 } },
  manifest: {},
};

describe("AccuracySummary", () => {
  it("reports post-issue metrics for the issued forecast", () => {
    render(<AccuracySummary accuracy={accuracy()} />);
    // "WAPE" appears in both the portfolio list and the series table header, so
    // anchor on a label unique to the portfolio list.
    const portfolio = screen.getByText("Matched periods").closest("dl");
    expect(portfolio).not.toBeNull();
    expect(within(portfolio as HTMLElement).getByText("9.0%")).toBeVisible();
    expect(within(portfolio as HTMLElement).getByText("-2.40%")).toBeVisible();
    expect(within(portfolio as HTMLElement).getByText("0.800")).toBeVisible();
  });

  it("reports how many periods are not yet due", () => {
    render(<AccuracySummary accuracy={accuracy()} />);
    const portfolio = screen.getByText("Periods not yet due").closest("div");
    expect(within(portfolio as HTMLElement).getByText("2")).toBeVisible();
  });

  it("reports an uncomputable metric as unavailable rather than zero", () => {
    // A forecast scored as MASE 0.000 would read as flawless. It means the
    // metric could not be computed at all.
    render(
      <AccuracySummary
        accuracy={accuracy({
          metrics: { ...accuracy().metrics, mase: null, coverage_p10_p90: null },
          metric_warnings: ["MASE needs at least two matched periods."],
        })}
      />,
    );
    expect(screen.getAllByText("not available").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0.000")).not.toBeInTheDocument();
  });

  it("surfaces the reason a metric is missing", () => {
    render(
      <AccuracySummary
        accuracy={accuracy({ metric_warnings: ["MASE is undefined: the actuals do not change."] })}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(/do not change/i);
  });

  it("says nothing has been issued rather than showing empty metrics", () => {
    render(
      <AccuracySummary
        accuracy={accuracy({
          issued_id: null,
          matched_points: 0,
          metric_warnings: ["No forecast has been issued yet."],
        })}
      />,
    );
    expect(screen.getByText(/no forecast has been issued yet/i)).toBeVisible();
  });

  it("alerts when actuals matched nothing instead of showing a score", () => {
    render(
      <AccuracySummary
        accuracy={accuracy({
          matched_points: 0,
          metric_warnings: ["No actuals matched the issued forecast."],
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/no actuals matched/i);
  });

  it("shows per-series accuracy, not just a portfolio number", () => {
    render(<AccuracySummary accuracy={accuracy()} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("egypt")).toBeVisible();
  });
});

describe("IssuedForecastBanner", () => {
  it("states when it was issued and on what assumptions", () => {
    // The accuracy number is unreadable without knowing what it assumed.
    render(<IssuedForecastBanner issued={ISSUED} />);
    expect(screen.getByText(/forecast issued/i)).toBeVisible();
    expect(screen.getByText("2026-08-15T00:00:00Z")).toBeVisible();
    expect(screen.getByText(/price: 2026-09-01=12.5/i)).toBeVisible();
  });

  it("names the revision the forecast was issued from", () => {
    render(<IssuedForecastBanner issued={ISSUED} />);
    expect(screen.getByText("2")).toBeVisible();
  });

  it("explains what issuing is for when nothing is issued", () => {
    render(<IssuedForecastBanner issued={null} />);
    expect(screen.getByText(/nothing issued yet/i)).toBeVisible();
  });
});
