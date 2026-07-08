import { render, screen } from "@testing-library/react";
import FlowVolatilityGauge from "./FlowVolatilityGauge";

jest.mock("../hooks/useVolatilityNeedle", () => ({
  useVolatilityNeedle: (base) => base + 5,
}));

describe("FlowVolatilityGauge", () => {
  it("renders volatility gauge with jitter badge", () => {
    render(
      <FlowVolatilityGauge
        basePercent={40}
        label="Arrival volatility"
        primaryDisplay="1200 ms σ"
        detail="demo"
      />
    );
    expect(screen.getByText("Arrival volatility")).toBeInTheDocument();
    expect(screen.getByText("1200 ms σ")).toBeInTheDocument();
    expect(screen.getByText(/Live jitter · 100 ms/i)).toBeInTheDocument();
  });
});
