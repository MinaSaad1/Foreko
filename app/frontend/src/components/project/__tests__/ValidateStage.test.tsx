import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ValidationLeaderboard } from "../ValidationLeaderboard";
import { PortfolioExceptionsTable } from "../PortfolioExceptionsTable";
import type { MetricSet, ValidationResult } from "@/types/validation";

function metrics(overrides: Partial<MetricSet> = {}): MetricSet {
  return {
    mase: 0.65,
    wape: 0.12,
    smape: 0.11,
    rmse: 4.2,
    bias_pct: 1.5,
    coverage_p10_p90: 0.8,
    warnings: [],
    ...overrides,
  };
}

function result(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    primary_metric: "mase",
    portfolio_metrics: metrics(),
    series_policies: {
      egypt: {
        series_id: "egypt",
        champion: "timesfm",
        challenger: "lightgbm",
        eligible: ["timesfm", "lightgbm"],
        ineligible: {},
        reason: "timesfm has the lowest MASE (0.65) among 2 eligible candidates.",
        ensemble_weights: {},
        metrics: { timesfm: metrics(), lightgbm: metrics({ mase: 0.9 }) },
      },
    },
    failures: [],
    ...overrides,
  };
}

function renderLeaderboard(r: ValidationResult) {
  return render(
    <MemoryRouter>
      <ValidationLeaderboard result={r} />
    </MemoryRouter>,
  );
}

describe("ValidationLeaderboard", () => {
  it("shows the champion and the reason it was selected", () => {
    renderLeaderboard(result());
    expect(screen.getByText("timesfm")).toBeVisible();
    expect(screen.getByText(/lowest MASE/i)).toBeVisible();
  });

  it("reports an uncomputable metric as unavailable rather than zero", () => {
    // Zero is a real answer for "no error". Rendering it for "undefined" would
    // present a broken metric as a perfect one.
    renderLeaderboard(
      result({
        portfolio_metrics: metrics({ wape: null, coverage_p10_p90: null }),
      }),
    );
    expect(screen.getAllByText("not available").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  it("names a series with no eligible champion instead of leaving it blank", () => {
    renderLeaderboard(
      result({
        series_policies: {
          uae: {
            series_id: "uae",
            champion: null,
            challenger: null,
            eligible: [],
            ineligible: { timesfm: "Failed at least one fold." },
            reason: "No candidate completed every fold, so there is no champion.",
            ensemble_weights: {},
            metrics: {},
          },
        },
      }),
    );
    expect(screen.getByText(/No eligible champion/i)).toBeVisible();
  });

  it("surfaces a portfolio warning about unscored series", () => {
    renderLeaderboard(
      result({
        portfolio_metrics: metrics({
          warnings: ["1 of 2 series have no eligible champion and are excluded."],
        }),
      }),
    );
    expect(screen.getByRole("note")).toHaveTextContent(/no eligible champion/i);
  });
});

describe("PortfolioExceptionsTable", () => {
  it("distinguishes a candidate that failed from one that scored badly", () => {
    render(
      <PortfolioExceptionsTable
        result={result({
          series_policies: {
            egypt: {
              ...result().series_policies.egypt,
              ineligible: { lightgbm: "Failed at least one fold." },
            },
          },
        })}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("lightgbm")).toBeVisible();
    expect(within(table).getByText("Failed at least one fold.")).toBeVisible();
  });

  it("alerts when a series has no champion at all", () => {
    render(
      <PortfolioExceptionsTable
        result={result({
          series_policies: {
            uae: {
              series_id: "uae",
              champion: null,
              challenger: null,
              eligible: [],
              ineligible: {},
              reason: "No candidate completed every fold, so there is no champion.",
              ensemble_weights: {},
              metrics: {},
            },
          },
        })}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/no eligible champion/i);
  });

  it("says so plainly when nothing went wrong", () => {
    render(<PortfolioExceptionsTable result={result()} />);
    expect(
      screen.getByText(/every candidate completed every fold/i),
    ).toBeVisible();
  });
});
