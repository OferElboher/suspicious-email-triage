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
    totalRelation: "eq",
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

  it("enables Next when ES reports gte total cap (10,000+) and full first page", async () => {
    getJson.mockImplementation(async (path) => {
      if (path.startsWith("/search/reviews")) {
        return {
          enabled: true,
          hits: Array.from({ length: 20 }, (_, i) => ({
            reviewId: `id-${i}`,
            subject: `Row ${i}`,
            updatedAt: "2026-06-26T12:00:00Z",
          })),
          total: 10000,
          totalRelation: "gte",
          limit: 20,
          offset: 0,
          hasMore: true,
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    render(<ReviewSearchPanel standalone />);
    fireEvent.click(screen.getByRole("button", { name: /Search reviews/i }));

    expect(await screen.findByText(/10,000\+ match/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Last/i })).toBeDisabled();
  });

  it("shows helpful message when jump to date returns 404", async () => {
    getJson.mockImplementation(async (path) => {
      if (path.startsWith("/search/reviews")) {
        return mockSearchPage({ total: 5, offset: 0 });
      }
      if (path.startsWith("/search/page-for-date")) {
        const err = new Error("Not Found");
        err.status = 404;
        err.body = { error: "no_reviews_on_date", date: "2026-06-26" };
        throw err;
      }
      throw new Error(`unexpected ${path}`);
    });

    render(<ReviewSearchPanel standalone />);
    fireEvent.click(screen.getByRole("button", { name: /Search reviews/i }));
    await screen.findByText(/5 match/i);

    fireEvent.change(screen.getByLabelText(/Jump to date/i), {
      target: { value: "2026-06-26" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Go$/i }));

    expect(
      await screen.findByText(/No reviews on 2026-06-26 matching your current filters/i)
    ).toBeInTheDocument();
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
