import { render, screen } from "@testing-library/react";
import FlowGauge from "./FlowGauge";

describe("FlowGauge", () => {
  it("renders label and clamped percentage", () => {
    render(<FlowGauge value={150} label="Ingest rate" detail="5 / min" tone="ok" />);
    expect(screen.getByText("Ingest rate")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("5 / min")).toBeInTheDocument();
  });
});
