import { fireEvent, render, screen } from "@testing-library/react";
import CampaignGraphCanvas from "./CampaignGraphCanvas";
import * as exportLib from "../lib/graphDetailExport";

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
    jest.spyOn(exportLib, "copyGraphDetailText").mockResolvedValue(undefined);
    jest.spyOn(exportLib, "saveGraphDetailTextWithPicker").mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens context menu on node right-click", () => {
    render(<CampaignGraphCanvas graph={SAMPLE_GRAPH} zoom={1} />);
    const label = screen.getAllByText(/Review abc/)[0];
    // eslint-disable-next-line testing-library/no-node-access
    fireEvent.contextMenu(label.parentElement);
    expect(screen.getByTestId("graph-context-menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /copy/i })).toBeInTheDocument();
  });

  it("copy menu item sends full tooltip text to clipboard helper", () => {
    render(<CampaignGraphCanvas graph={SAMPLE_GRAPH} zoom={1} />);
    const label = screen.getAllByText(/Review abc/)[0];
    // eslint-disable-next-line testing-library/no-node-access
    fireEvent.contextMenu(label.parentElement);
    fireEvent.click(screen.getByRole("menuitem", { name: /^Copy$/i }));
    expect(exportLib.copyGraphDetailText).toHaveBeenCalledWith(
      expect.stringContaining("Review")
    );
  });
});
