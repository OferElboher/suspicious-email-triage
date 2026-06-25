import { render, screen, fireEvent } from "@testing-library/react";
import RecentReviewsList from "./RecentReviewsList";

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
        selectedReviewId={null}
        includeSimulation
        onIncludeSimulationChange={() => {}}
        onRefresh={() => {}}
        onPageChange={() => {}}
        onSelectReview={() => {}}
      />
    );
    expect(screen.getByText(/\[Simulation\]/)).toBeInTheDocument();
  });

  it("calls onSelectReview when a row is clicked", () => {
    const onSelectReview = jest.fn();
    render(
      <RecentReviewsList
        reviews={summaries}
        page={0}
        lastPage={0}
        hasMore={false}
        totalReviews={1}
        selectedReviewId={null}
        onRefresh={() => {}}
        onPageChange={() => {}}
        onSelectReview={onSelectReview}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Test subject/i }));
    expect(onSelectReview).toHaveBeenCalledWith("abc123");
  });

  it("highlights the selected review row", () => {
    render(
      <RecentReviewsList
        reviews={summaries}
        page={0}
        lastPage={0}
        hasMore={false}
        totalReviews={1}
        selectedReviewId="abc123"
        onRefresh={() => {}}
        onPageChange={() => {}}
        onSelectReview={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /Test subject/i })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });
});
