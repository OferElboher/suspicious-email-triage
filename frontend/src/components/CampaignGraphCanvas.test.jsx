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
  it("calls onSelectDetail when a node is clicked", () => {
    const onSelectDetail = jest.fn();
    render(
      <CampaignGraphCanvas graph={SAMPLE_GRAPH} zoom={1} onSelectDetail={onSelectDetail} />
    );
    const label = screen.getAllByText(/Review abc/)[0];
    // eslint-disable-next-line testing-library/no-node-access -- SVG groups lack roles
    fireEvent.click(label.parentElement);
    expect(onSelectDetail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "node", text: expect.stringContaining("Review") })
    );
  });

  it("shows hover preview without action buttons", () => {
    render(<CampaignGraphCanvas graph={SAMPLE_GRAPH} zoom={1} />);
    const label = screen.getAllByText(/Review abc/)[0];
    // eslint-disable-next-line testing-library/no-node-access
    fireEvent.mouseEnter(label.parentElement);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
  });
});
