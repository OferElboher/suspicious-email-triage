import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecentReviewsList from "./RecentReviewsList";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
}));

const { getJson } = require("../api/client");

const summaries = [
  {
    _id: "abc123",
    subject: "Test subject",
    senderEmail: "a@b.com",
    status: "completed",
    analysisResult: { verdict: "suspicious" },
  },
];

describe("RecentReviewsList", () => {
  beforeEach(() => {
    getJson.mockResolvedValue({
      _id: "abc123",
      subject: "Test subject",
      body: "Full body text",
      senderEmail: "a@b.com",
      links: ["http://evil.com"],
      status: "completed",
    });
  });

  it("prefixes simulation rows in the list", () => {
    render(
      <RecentReviewsList
        reviews={[
          {
            _id: "sim1",
            subject: "Simulated ingest 2026",
            senderEmail: "sim@dev.local",
            source: "dev_simulation",
            status: "completed",
          },
        ]}
        page={0}
        lastPage={0}
        hasMore={false}
        totalReviews={1}
        canReadGraph={false}
        includeSimulation
        onIncludeSimulationChange={() => {}}
        onRefresh={() => {}}
        onPageChange={() => {}}
      />
    );
    expect(screen.getByText(/\[Simulation\]/)).toBeInTheDocument();
  });

  it("expands review details on row click", async () => {
    render(
      <RecentReviewsList
        reviews={summaries}
        page={0}
        lastPage={0}
        hasMore={false}
        totalReviews={1}
        canReadGraph={false}
        onRefresh={() => {}}
        onPageChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Test subject/i }));
    await waitFor(() => {
      expect(getJson).toHaveBeenCalledWith("/reviews/abc123");
    });
    expect(await screen.findByText(/Full body text/)).toBeInTheDocument();
  });
});
