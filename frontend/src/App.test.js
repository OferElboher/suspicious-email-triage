import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

const mockUser = {
  id: 1,
  email: "admin@local.test",
  roles: ["admin"],
  permissions: [
    "reviews.read",
    "reviews.write",
    "reviews.override",
    "metrics.read",
    "admin.users",
  ],
};

beforeEach(() => {
  localStorage.setItem("triage_auth_token", "test-token");
  global.fetch = jest.fn((url) => {
    const u = String(url);
    if (u.includes("/auth/me")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      });
    }
    if (u.includes("/dev/features")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            simulation: false,
            analytics: true,
            simulationMaxEventsPerMin: 30,
          }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: [], hasMore: false, total: 0 }),
    });
  });
});

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

test("renders triage header when authenticated", async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByText(/Suspicious email triage/i)).toBeInTheDocument();
  });
});

test("shows django admin link for admin role", async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole("link", { name: /User administration/i })).toBeInTheDocument();
  });
});

test("restores analytics view after refresh hash", async () => {
  window.location.hash = "#analytics";
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Analytics & graphs/i })).toHaveClass("active");
  });
});
