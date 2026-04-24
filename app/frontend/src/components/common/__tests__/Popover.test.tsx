import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Popover } from "../Popover";

describe("Popover", () => {
  it("is closed by default and opens on trigger click", async () => {
    const user = userEvent.setup();
    render(
      <Popover
        ariaLabel="Info"
        trigger={<button type="button">Toggle</button>}
      >
        <p>Panel content</p>
      </Popover>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: /toggle/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Panel content");
  });

  it("sets aria-expanded, aria-haspopup, aria-controls on the trigger", async () => {
    const user = userEvent.setup();
    render(
      <Popover
        ariaLabel="Info"
        trigger={<button type="button">Toggle</button>}
      >
        <p>content</p>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: /toggle/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-controls");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on ESC and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <Popover
        ariaLabel="Info"
        trigger={<button type="button">Toggle</button>}
      >
        <p>content</p>
      </Popover>,
    );
    const trigger = screen.getByRole("button", { name: /toggle/i });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Popover
          ariaLabel="Info"
          trigger={<button type="button">Toggle</button>}
        >
          <p>content</p>
        </Popover>
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /toggle/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /outside/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
