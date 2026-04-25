import { describe, it, expect } from"vitest";
import { render, screen } from"@testing-library/react";
import { MemoryRouter } from"react-router-dom";
import { Term } from"../Term";

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Term", () => {
  it("renders a button with dashed underline styling", () => {
    renderWithRouter(<Term k="mape" />);
    const btn = screen.getByRole("button", { name: /mape/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toMatch(/border-dashed/);
  });

  it("falls back to plain text when the key is unknown", () => {
    renderWithRouter(<Term k="not-a-real-term">Label</Term>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Label")).toBeInTheDocument();
  });

  it("opens a popover with definition and business angle when the trigger is focused", async () => {
    renderWithRouter(<Term k="mape" />);

    const btn = screen.getByRole("button", { name: /mape/i });
    btn.focus();

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/Average percentage error/i);
    expect(dialog).toHaveTextContent(/For your business/i);
  });

  it("uses custom children as the visible label", () => {
    renderWithRouter(<Term k="mape">accuracy</Term>);
    expect(screen.getByRole("button", { name: /accuracy/i })).toBeInTheDocument();
  });
});
