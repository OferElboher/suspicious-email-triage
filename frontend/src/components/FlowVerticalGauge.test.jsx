import { render, screen } from "@testing-library/react";
import FlowVerticalGauge from "./FlowVerticalGauge";

describe("FlowVerticalGauge", () => {
  it("renders vertical tank label and primary display", () => {
    render(
      <FlowVerticalGauge value={55} primaryDisplay="12" label="Pending level" detail="demo" tone="ok" />
    );
    expect(screen.getByText("Pending level")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /Pending level: 12/i })).toHaveAttribute(
      "aria-valuenow",
      "55"
    );
  });
});
