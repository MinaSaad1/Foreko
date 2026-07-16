import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FutureFactorGrid, missingCells } from "../FutureFactorGrid";
import type { FactorPlanRequirements, FillPolicy } from "@/types/factors-plan";

const REQUIREMENTS: FactorPlanRequirements = {
  periods: ["2026-08-01", "2026-09-01"],
  required: ["price"],
  roles: { price: "known_future_numerical" },
  calendar: {},
};

function renderGrid(
  values: Record<string, Record<string, number | string>> = {},
  fillPolicies: Record<string, FillPolicy> = {},
) {
  const onChange = vi.fn();
  const onPolicyChange = vi.fn();
  render(
    <FutureFactorGrid
      requirements={REQUIREMENTS}
      values={values}
      fillPolicies={fillPolicies}
      onChange={onChange}
      onPolicyChange={onPolicyChange}
    />,
  );
  return { onChange, onPolicyChange };
}

describe("missingCells", () => {
  it("reports every period a required factor is missing", () => {
    expect(missingCells(REQUIREMENTS, {}, {})).toEqual([
      { covariate: "price", period: "2026-08-01" },
      { covariate: "price", period: "2026-09-01" },
    ]);
  });

  it("treats an explicit fill policy as an answer, not a gap", () => {
    // The user has said what should happen, so nothing is missing.
    expect(missingCells(REQUIREMENTS, {}, { price: "forward_fill" })).toEqual([]);
  });

  it("counts an empty string as missing", () => {
    const values = { price: { "2026-08-01": "", "2026-09-01": 12 } };
    expect(missingCells(REQUIREMENTS, values, {})).toEqual([
      { covariate: "price", period: "2026-08-01" },
    ]);
  });

  it("reports nothing when every period has a value", () => {
    const values = { price: { "2026-08-01": 12, "2026-09-01": 13 } };
    expect(missingCells(REQUIREMENTS, values, {})).toEqual([]);
  });
});

describe("FutureFactorGrid", () => {
  it("names the periods still needing input", () => {
    renderGrid();
    expect(screen.getByRole("alert")).toHaveTextContent(/price at 2026-08-01/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/2 values still needed/i);
  });

  it("offers a cell per factor per period", () => {
    renderGrid();
    expect(screen.getByLabelText("price for 2026-08-01")).toBeVisible();
    expect(screen.getByLabelText("price for 2026-09-01")).toBeVisible();
  });

  it("defaults to blocking rather than filling", () => {
    // The default must never quietly invent a value.
    renderGrid();
    expect(screen.getByLabelText(/fill policy for price/i)).toHaveValue("none");
  });

  it("records a typed value as a number", async () => {
    // The grid is controlled, and onChange here is a mock, so `values` never
    // updates between keystrokes. Type one character and assert the emitted
    // change, rather than a multi-digit string that the parent would have had
    // to feed back in.
    const { onChange } = renderGrid();
    await userEvent.type(screen.getByLabelText("price for 2026-08-01"), "7");
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.price["2026-08-01"]).toBe(7);
    expect(typeof last.price["2026-08-01"]).toBe("number");
  });

  it("drops a cleared cell rather than storing an empty string", async () => {
    const { onChange } = renderGrid({ price: { "2026-08-01": 12 } });
    await userEvent.clear(screen.getByLabelText("price for 2026-08-01"));
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.price["2026-08-01"]).toBeUndefined();
  });

  it("clears the warning once a policy is chosen", () => {
    renderGrid({}, { price: "forward_fill" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/recorded with the run/i);
  });

  it("says so when the policy needs no future factors", () => {
    render(
      <FutureFactorGrid
        requirements={{ ...REQUIREMENTS, required: [] }}
        values={{}}
        fillPolicies={{}}
        onChange={vi.fn()}
        onPolicyChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/needs no future factors/i)).toBeVisible();
  });
});

describe("FutureFactorGrid in a scenario", () => {
  function renderScenario() {
    render(
      <FutureFactorGrid
        requirements={REQUIREMENTS}
        values={{}}
        fillPolicies={{}}
        onChange={vi.fn()}
        onPolicyChange={vi.fn()}
        emptyMeans="inherit"
      />,
    );
  }

  it("does not claim a value is needed when it will be inherited", () => {
    // In a scenario an empty cell keeps the baseline's value, so telling the
    // author it is "still needed" is simply false.
    renderScenario();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/still needed/i)).not.toBeInTheDocument();
  });

  it("says an empty cell keeps the baseline value", () => {
    renderScenario();
    expect(screen.getByText(/keeps the baseline's value/i)).toBeVisible();
    expect(
      screen.queryByText(/the forecast will not run until/i),
    ).not.toBeInTheDocument();
  });

  it("relabels the fallback column for a scenario", () => {
    renderScenario();
    expect(screen.getByText("Baseline fallback")).toBeVisible();
    expect(screen.queryByText("If left empty")).not.toBeInTheDocument();
  });

  it("still blocks by default, so the baseline keeps its guarantee", () => {
    renderGrid();
    expect(screen.getByRole("alert")).toHaveTextContent(/still needed/i);
    expect(screen.getByText("If left empty")).toBeVisible();
  });
});

describe("FutureFactorGrid when no model reads the factors", () => {
  it("explains why it is not asking, rather than showing nothing", () => {
    render(
      <FutureFactorGrid
        requirements={{ ...REQUIREMENTS, required: [], ignored_by_policy: ["price"] }}
        values={{}}
        fillPolicies={{}}
        onChange={vi.fn()}
        onPolicyChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/cannot read price/i)).toBeVisible();
  });
});
