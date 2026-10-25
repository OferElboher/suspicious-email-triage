import { fireEvent, render, screen } from "@testing-library/react";
import CampaignGraphCanvas from "./CampaignGraphCanvas";

const SAMPLE_GRAPH = {
  indicator: "evil.example",
  nodes: [
    { id: "c1", type: "Campaign", label: "evil.example" },
    { id: "r1", type: "Review", label: "Review abc" },
  ],
  edges: [{ source: "r1", target: "c1", type: "PART_OF_CAMPAIGN" }],
};

describe("CampaignGraphCanvas", () => {
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => "blob:mock");
    global.URL.revokeObjectURL = jest.fn();
  });

  it("shows copy and save actions when hovering a node", () => {
    render(<CampaignGraphCanvas graph={SAMPLE_GRAPH} zoom={1} />);
    // Hover the node label group (SVG has no Testing Library roles per circle).
    const label = screen.getAllByText(/Review abc/)[0];
    // eslint-disable-next-line testing-library/no-node-access -- SVG node groups lack ARIA roles
    fireEvent.mouseEnter(label.parentElement);
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save to file/i })).toBeInTheDocument();
  });
});
