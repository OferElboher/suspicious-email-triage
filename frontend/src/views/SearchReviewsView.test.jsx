import { render, screen } from "@testing-library/react";
import SearchReviewsView from "../views/SearchReviewsView";

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    hasPermission: (code) => code === "reviews.read" || code === "dev.reset",
  }),
}));

jest.mock("../components/ReviewSearchPanel", () => {
  return function MockReviewSearchPanel() {
    return <div data-testid="review-search-panel">Review search</div>;
  };
});

jest.mock("../components/SearchIndexPanel", () => {
  return function MockSearchIndexPanel() {
    return <div data-testid="search-index-panel">Index admin</div>;
  };
});

describe("SearchReviewsView", () => {
  it("renders review search and index admin for admin/dev.reset", () => {
    render(<SearchReviewsView />);
    expect(screen.getByTestId("review-search-panel")).toBeInTheDocument();
    expect(screen.getByTestId("search-index-panel")).toBeInTheDocument();
  });
});
