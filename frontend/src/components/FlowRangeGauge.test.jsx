import { render, screen } from "@testing-library/react";
import FlowRangeGauge from "./FlowRangeGauge";

const ZONES = [
  { from: 0, to: 40, tone: "ok", label: "Normal" },
  { from: 40, to: 70, tone: "warn", label: "Elevated" },
  { from: 70, to: 100, tone: "danger", label: "Critical" },
];

describe("FlowRangeGauge", () => {
  it("shows zone label for value in green band", () => {
    render(
      <FlowRangeGauge value={25} zones={ZONES} label="Backlog" primaryDisplay="25%" detail="test" />
    );
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.queryByText("⚠")).not.toBeInTheDocument();
  });

  it("shows warning sign in danger zone", () => {
    render(
      <FlowRangeGauge value={85} zones={ZONES} label="Backlog" primaryDisplay="85%" detail="test" />
    );
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("⚠")).toBeInTheDocument();
  });
});
