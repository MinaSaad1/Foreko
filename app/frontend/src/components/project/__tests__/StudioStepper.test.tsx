import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudioStepper } from "../StudioStepper";
import type { StageStatus, StudioStage, WorkflowState } from "@/types/project";

function workflow(overrides: Partial<Record<StudioStage, StageStatus>>): WorkflowState {
  const base: Record<StudioStage, StageStatus> = {
    prepare: "complete",
    validate: "ready",
    forecast: "blocked",
    plan: "blocked",
    review: "blocked",
    ...overrides,
  } as Record<StudioStage, StageStatus>;

  return {
    project_id: "p1",
    revision: 1,
    next_stage: "validate",
    stages: Object.fromEntries(
      (Object.keys(base) as StudioStage[]).map((stage) => [
        stage,
        { stage, status: base[stage], reason: `${stage} reason`, run_id: null },
      ]),
    ) as WorkflowState["stages"],
  };
}

function renderStepper(active: StudioStage = "validate", state = workflow({})) {
  return render(
    <MemoryRouter>
      <StudioStepper projectId="p1" active={active} workflow={state} />
    </MemoryRouter>,
  );
}

describe("StudioStepper", () => {
  it("labels blocked and complete stages without relying on color", () => {
    renderStepper();
    expect(screen.getByText("Prepare").closest("a")).toHaveAccessibleName(
      /prepare complete/i,
    );
    expect(screen.getByText("Forecast").closest("a")).toHaveAccessibleName(
      /forecast blocked/i,
    );
  });

  it("states every stage status in text, not just color", () => {
    renderStepper();
    // A user who cannot distinguish the accent color must still be able to read
    // each stage's state.
    expect(screen.getByText("Validate").closest("a")).toHaveAccessibleName(
      /validate ready/i,
    );
    expect(screen.getByText("Review").closest("a")).toHaveAccessibleName(
      /review blocked/i,
    );
  });

  it("marks the active stage for assistive technology", () => {
    renderStepper("validate");
    expect(screen.getByText("Validate").closest("a")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByText("Prepare").closest("a")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps a blocked stage reachable so its reason can be read", () => {
    renderStepper();
    // A disabled element would be unreachable by keyboard, which would hide the
    // reason from exactly the users who need it written down.
    const forecast = screen.getByText("Forecast").closest("a");
    expect(forecast).toHaveAttribute("href", "/projects/p1/studio/forecast");
  });

  it("links each stage to its own studio route", () => {
    renderStepper();
    expect(screen.getByText("Prepare").closest("a")).toHaveAttribute(
      "href",
      "/projects/p1/studio/prepare",
    );
    expect(screen.getByText("Plan").closest("a")).toHaveAttribute(
      "href",
      "/projects/p1/studio/plan",
    );
  });

  it("reflects a needs-attention stage", () => {
    renderStepper("prepare", workflow({ prepare: "needs_attention" }));
    expect(screen.getByText("Prepare").closest("a")).toHaveAccessibleName(
      /prepare needs attention/i,
    );
  });
});
