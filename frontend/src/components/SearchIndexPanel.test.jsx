/**
 * SearchIndexPanel — admin index card stays visible when Elasticsearch is disabled.
 */
import { render, screen } from "@testing-library/react";
import SearchIndexPanel from "./SearchIndexPanel";
import { getJson } from "../api/client";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
  deleteJson: jest.fn(),
}));

describe("SearchIndexPanel", () => {
  beforeEach(() => {
    getJson.mockResolvedValue({
      enabled: false,
      reachable: false,
      documentCount: 0,
      index: "triage-reviews",
    });
  });

  it("renders setup instructions when Elasticsearch is disabled (not hidden)", async () => {
    render(<SearchIndexPanel />);
    expect(await screen.findByText(/Elasticsearch is disabled/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Search index \(Elasticsearch\)/i })
    ).toBeInTheDocument();
  });
});
