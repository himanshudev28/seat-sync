import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { DocumentTitle, HOME_TITLE, RouteFocus, formatTitle, routeTitle, usePageTitle } from ".";

function EventPage() {
  usePageTitle("Coldplay Live");
  return (
    <>
      <h1>Coldplay Live</h1>
      <section id="seats" aria-label="Seats">
        <button type="button">A1</button>
      </section>
    </>
  );
}

function App({ at = "/" }: { at?: string }) {
  return (
    <MemoryRouter initialEntries={[at]}>
      <DocumentTitle />
      <RouteFocus />
      <nav>
        <Link to="/">Home</Link> <Link to="/tickets">Tickets</Link> <Link to="/events/7">Event</Link>{" "}
        <Link to="/events/7#seats">Seats</Link> <Link to="/tickets?tab=past">Past</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<h1>Home</h1>} />
          <Route path="/tickets" element={<h1>My tickets</h1>} />
          <Route path="/events/:id" element={<EventPage />} />
        </Routes>
      </main>
    </MemoryRouter>
  );
}

describe("titles", () => {
  it("formats titles and route defaults", () => {
    expect(formatTitle([])).toBe(HOME_TITLE);
    expect(formatTitle(["Coldplay Live", undefined, " "])).toBe("Coldplay Live · SeatSync");
    expect(routeTitle("/")).toBeUndefined();
    expect(routeTitle("/admin/bookings")).toBe("Bookings · Admin");
    expect(routeTitle("/events/42")).toBe("Event");
    expect(routeTitle("/nope")).toBe("Page not found");
  });

  it("uses the route default, and the page title when the page sets one", async () => {
    render(<App />);
    await waitFor(() => expect(document.title).toBe(HOME_TITLE));
    await userEvent.click(screen.getByRole("link", { name: "Tickets" }));
    await waitFor(() => expect(document.title).toBe("My tickets · SeatSync"));
    await userEvent.click(screen.getByRole("link", { name: "Event" }));
    await waitFor(() => expect(document.title).toBe("Coldplay Live · SeatSync"));
  });
});

describe("RouteFocus", () => {
  it("leaves focus alone on first load", async () => {
    render(<App at="/tickets" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses the new h1 and announces the title, but not for search-only changes", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("link", { name: "Tickets" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "My tickets" });
    await waitFor(() => expect(heading).toHaveFocus());
    await waitFor(() =>
      expect(screen.getByText("My tickets · SeatSync", { selector: "[aria-live]" })).toBeInTheDocument(),
    );
    const past = screen.getByRole("link", { name: "Past" });
    past.focus();
    await userEvent.click(past);
    await new Promise((r) => setTimeout(r, 50));
    expect(past).toHaveFocus();
  });

  it("focuses the anchored section when the link has a hash", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("link", { name: "Seats" }));
    const section = await screen.findByRole("region", { name: "Seats" });
    await waitFor(() => expect(section).toHaveFocus());
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "A1" })).toHaveFocus();
  });
});
