/**
 * ReviewSearchPanel — paginated Elasticsearch search UI (mocked API).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReviewSearchPanel from "./ReviewSearchPanel";
import { getJson } from "../api/client";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
}));

/** Build a mock search response with offset pagination metadata. */
function mockSearchPage({ total = 45, offset = 0, limit = 20 } = {}) {
  const hits = Array.from({ length: Math.min(limit, Math.max(0, total - offset)) }, (_, i) => ({
    reviewId: `id-${offset + i}`,
    subject: `Subject ${offset + i}`,
    senderEmail: "a@test.local",
    verdict: "suspicious",
    status: "completed",
    updatedAt: "2026-06-15T12:00:00Z",
  }));
  return {
    enabled: true,
    hits,
    total,
    limit,
    offset,
    hasMore: offset + hits.length < total,
  };
}

describe("ReviewSearchPanel pagination", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getJson.mockImplementation(async (path) => {
      if (path.startsWith("/search/reviews")) {
        const url = new URL(path, "http://test");
        const offset = Number(url.searchParams.get("offset") || 0);
        return mockSearchPage({ total: 45, offset });
      }
      if (path.startsWith("/search/page-for-date")) {
        return { enabled: true, page: 2, limit: 20, onDayCount: 3, date: "2026-06-10" };
      }
      throw new Error(`unexpected ${path}`);
    });
  });

  it("shows pagination controls after search and loads next page", async () => {
    render(<ReviewSearchPanel standalone />);
    fireEvent.click(screen.getByRole("button", { name: /Search reviews/i }));

    expect(await screen.findByText(/45 match\(es\) total/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /First/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(getJson).toHaveBeenCalledWith(expect.stringContaining("offset=20"));
    });
    expect(await screen.findByText(/Page 2 of 3/i)).toBeInTheDocument();
  });

  it("jump to date calls page-for-date then loads that page", async () => {
    render(<ReviewSearchPanel standalone />);
    fireEvent.click(screen.getByRole("button", { name: /Search reviews/i }));
    await screen.findByText(/45 match\(es\) total/i);

    fireEvent.change(screen.getByLabelText(/Jump to date/i), {
      target: { value: "2026-06-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Go$/i }));

    await waitFor(() => {
      expect(getJson).toHaveBeenCalledWith(expect.stringContaining("/search/page-for-date"));
    });
    await waitFor(() => {
      expect(getJson).toHaveBeenCalledWith(expect.stringContaining("offset=40"));
    });
    expect(await screen.findByText(/3 match\(es\) on 2026-06-10/i)).toBeInTheDocument();
  });
});
