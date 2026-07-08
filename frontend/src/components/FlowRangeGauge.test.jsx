import { render, screen } from "@testing-library/react";
import FlowRangeGauge from "./FlowRangeGauge";

const ZONES = [
  { from: 0, to: 40, tone: "ok", label: "Normal" },
  { from: 40, to: 70, tone: "warn", label: "Elevated" },
  { from: 70, to: 100, tone: "danger", label: "Critical" },
];

describe("FlowRangeGauge", () => {
  it("always shows idle gray warning icon in normal zone", () => {
    render(
      <FlowRangeGauge value={25} zones={ZONES} label="Backlog" primaryDisplay="25%" detail="test" />
    );
    expect(screen.getByText("Normal")).toBeInTheDocument();
    const warning = screen.getByTestId("flow-range-warning");
    expect(warning).toHaveClass("flow-range-gauge__warning--idle");
    expect(warning).toHaveTextContent("⚠");
    expect(warning).not.toHaveClass("flow-range-gauge__warning--active");
  });

  it("activates colored warning in danger zone", () => {
    render(
      <FlowRangeGauge value={85} zones={ZONES} label="Backlog" primaryDisplay="85%" detail="test" />
    );
    expect(screen.getByText("Critical")).toBeInTheDocument();
    const warning = screen.getByTestId("flow-range-warning");
    expect(warning).toHaveClass("flow-range-gauge__warning--active");
    expect(warning).toHaveClass("flow-range-gauge__warning--danger");
  });

  it("activates amber warning in elevated zone", () => {
    render(<FlowRangeGauge value={55} zones={ZONES} label="Backlog" primaryDisplay="55%" />);
    const warning = screen.getByTestId("flow-range-warning");
    expect(warning).toHaveClass("flow-range-gauge__warning--warn");
  });
});
