import { render, screen, waitFor } from "@testing-library/react";
import GraphView from "./GraphView";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
}));

const { getJson } = require("../api/client");

describe("GraphView", () => {
  beforeEach(() => {
    getJson.mockReset();
  });

  it("shows empty state without SVG when no campaigns", async () => {
    getJson.mockResolvedValueOnce({ campaigns: [] });
    render(<GraphView />);
    await waitFor(() => {
      expect(screen.getByText(/No campaigns detected yet/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("img", { name: /campaign relationship graph/i })).not.toBeInTheDocument();
  });

  it("loads campaign subgraph when campaigns exist", async () => {
    getJson
      .mockResolvedValueOnce({
        campaigns: [{ indicator: "evil.test", reviewCount: 3, kind: "shared_domain" }],
      })
      .mockResolvedValueOnce({
        nodes: [{ id: "campaign:evil.test", label: "evil.test", type: "Campaign", properties: {} }],
        edges: [],
        indicator: "evil.test",
        reviewCount: 3,
      });
    render(<GraphView />);
    await waitFor(() => {
      expect(screen.getByRole("img", { name: /campaign relationship graph/i })).toBeInTheDocument();
    });
    expect(getJson).toHaveBeenCalledWith(
      "/graph/campaign-subgraph?indicator=evil.test"
    );
    expect(screen.getByText(/1 \/ 1: evil.test/)).toBeInTheDocument();
  });
});
