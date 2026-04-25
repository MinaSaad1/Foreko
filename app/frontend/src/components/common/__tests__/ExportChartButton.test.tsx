import { describe, it, expect, vi } from"vitest";
import { render, screen } from"@testing-library/react";
import userEvent from"@testing-library/user-event";
import { ExportChartButton } from"../ExportChartButton";

describe("ExportChartButton", () => {
  it("renders default label uppercase", () => {
    render(<ExportChartButton onExport={() => undefined} />);
    expect(screen.getByRole("button")).toHaveTextContent(/SAVE IMAGE/);
  });

  it("renders custom label", () => {
    render(<ExportChartButton onExport={() => undefined} label="EXPORT PNG" />);
    expect(screen.getByRole("button")).toHaveTextContent(/EXPORT PNG/);
  });

  it("calls onExport once per click and tolerates async handlers", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<ExportChartButton onExport={onExport} />);
    await user.click(screen.getByRole("button"));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("merges custom className", () => {
    render(<ExportChartButton onExport={() => undefined} className="-mt-8" />);
    expect(screen.getByRole("button").className).toMatch(/-mt-8/);
  });
});
