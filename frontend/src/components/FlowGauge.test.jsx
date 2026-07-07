import { render, screen } from "@testing-library/react";
import FlowGauge from "./FlowGauge";

describe("FlowGauge", () => {
  it("renders label and clamped percentage when no primaryDisplay", () => {
    render(<FlowGauge value={150} label="Ingest rate" detail="5 / min" tone="ok" />);
    expect(screen.getByText("Ingest rate")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("5 / min")).toBeInTheDocument();
  });

  it("exposes needle rotation via accessible meter label", () => {
    render(<FlowGauge value={50} primaryDisplay="15/min" label="Ingest" detail="scale 30" />);
    expect(screen.getByText("15/min")).toBeInTheDocument();
    expect(screen.getByText("50% of scale")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /Ingest: 15\/min/i })).toHaveAttribute(
      "aria-valuenow",
      "50"
    );
  });

  it("reports zero percent on the meter at rest", () => {
    render(<FlowGauge value={0} label="Empty" />);
    expect(screen.getByRole("meter", { name: /Empty: 0%/i })).toHaveAttribute("aria-valuenow", "0");
  });
});
