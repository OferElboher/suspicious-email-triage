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
    expect(screen.queryByText(/graph_demo_neo4j_phishing/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /campaign relationship graph/i })).not.toBeInTheDocument();
  });

  it("exposes first and last campaign navigation", async () => {
    getJson
      .mockResolvedValueOnce({
        campaigns: [
          { indicator: "a.test", reviewCount: 3, kind: "shared_domain" },
          { indicator: "b.test", reviewCount: 2, kind: "shared_domain" },
        ],
      })
      .mockResolvedValueOnce({
        nodes: [{ id: "campaign:a.test", label: "a.test", type: "Campaign", properties: {} }],
        edges: [],
        indicator: "a.test",
        reviewCount: 3,
      })
      .mockResolvedValueOnce({
        nodes: [{ id: "campaign:b.test", label: "b.test", type: "Campaign", properties: {} }],
        edges: [],
        indicator: "b.test",
        reviewCount: 2,
      });
    render(<GraphView />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /First/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Last/i })).toBeInTheDocument();
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
