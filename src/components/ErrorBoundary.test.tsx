import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

/** Throws until `crash.on` is cleared, so "Try again" can render the page successfully. */
const crash = { on: true, message: "boom" };
function Page() {
  if (crash.on) throw new Error(crash.message);
  return <p>Page content</p>;
}

describe("ErrorBoundary", () => {
  const reload = vi.fn();
  const original = window.location;

  beforeEach(() => {
    crash.on = true;
    crash.message = "boom";
    reload.mockReset();
    // jsdom's location.reload can't be spied on directly; swap in a stub for these tests.
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
    vi.restoreAllMocks();
  });

  it("inline: renders a div[role=alert] and no <main> landmark", () => {
    const { container } = render(
      <ErrorBoundary inline>
        <Page />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.tagName).toBe("DIV");
    expect(container.querySelector("main")).toBeNull();
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
  });

  it("full-screen (default): renders a <main role=alert>", () => {
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert").tagName).toBe("MAIN");
  });

  it("inline: Try again re-renders the page without reloading", async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary inline>
        <Page />
      </ErrorBoundary>,
    );
    crash.on = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it("inline: a failed chunk load reloads the page (only a reload fetches the new chunks)", async () => {
    const user = userEvent.setup();
    crash.message = "Failed to fetch dynamically imported module: /assets/Events-abc.js";
    render(
      <ErrorBoundary inline>
        <Page />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("full-screen: Try again always reloads", async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Page />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
