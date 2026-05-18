import { render, screen } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    const u = String(url);
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
      json: () => Promise.resolve({ data: [], hasMore: false }),
    });
  });
});

test("renders triage header", () => {
  render(<App />);
  expect(screen.getByText(/Suspicious email triage/i)).toBeInTheDocument();
});
