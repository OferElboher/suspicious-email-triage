import { render, screen, within } from "@testing-library/react";
import FlowWarningBadge from "./FlowWarningBadge";

describe("FlowWarningBadge", () => {
  it("renders SVG triangle with accessible label when not hidden", () => {
    render(
      <FlowWarningBadge
        className="flow-range-gauge__warning flow-range-gauge__warning--idle"
        title="Threshold indicator (idle)"
      />
    );
    const badge = screen.getByTestId("flow-range-warning");
    expect(badge).toHaveAttribute("role", "img");
    expect(badge).toHaveAttribute("aria-label", "Threshold indicator (idle)");
    expect(within(badge).getByTestId("flow-warning-badge-svg")).toBeInTheDocument();
  });

  it("hides from accessibility tree when ariaHidden is true", () => {
    render(
      <FlowWarningBadge
        className="flow-range-gauge__warning flow-range-gauge__warning--active"
        title="Elevated"
        ariaHidden
      />
    );
    const badge = screen.getByTestId("flow-range-warning");
    expect(badge).toHaveAttribute("aria-hidden", "true");
    expect(badge).not.toHaveAttribute("aria-label");
  });
});
