import { describe, it, expect, beforeEach } from"vitest";
import { render, screen } from"@testing-library/react";
import userEvent from"@testing-library/user-event";
import { MemoryRouter } from"react-router-dom";
import { PageIntro } from"../PageIntro";

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("PageIntro", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders title, summary, when-to-use, and business questions", () => {
    renderWithRouter(<PageIntro pageKey="backtest" />);
    expect(screen.getByText(/stress-test/i)).toBeInTheDocument();
    expect(screen.getByText(/When to use/i)).toBeInTheDocument();
    expect(screen.getByText(/Questions it helps answer/i)).toBeInTheDocument();
  });

  it("defaults to expanded and toggles closed on collapse click", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PageIntro pageKey="backtest" />);

    expect(screen.getByText(/Questions it helps answer/i)).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /hide this intro/i });
    await user.click(toggle);
    expect(screen.queryByText(/Questions it helps answer/i)).toBeNull();
  });

  it("persists collapsed state to localStorage and rehydrates on remount", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithRouter(<PageIntro pageKey="backtest" />);

    const toggle = screen.getByRole("button", { name: /hide this intro/i });
    await user.click(toggle);
    expect(window.localStorage.getItem("foresee:pageIntro:backtest:open")).toBe("0");
    unmount();

    renderWithRouter(<PageIntro pageKey="backtest" />);
    expect(screen.queryByText(/Questions it helps answer/i)).toBeNull();
  });

  it("renders nothing for an unknown page key", () => {
    const { container } = renderWithRouter(
      // @ts-expect-error, deliberately invalid key
      <PageIntro pageKey="not-a-page" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
