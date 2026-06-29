import { render, screen } from "@testing-library/react";
import GraphLegend from "./GraphLegend";

describe("GraphLegend", () => {
  it("renders a swatch and label for each node type", () => {
    render(<GraphLegend />);
    expect(screen.getByRole("list", { name: /Graph node type legend/i })).toBeInTheDocument();
    expect(screen.getByText("Sender")).toBeInTheDocument();
    expect(screen.getByText("Campaign")).toBeInTheDocument();
    expect(screen.getByText(/Phishing campaign cluster/i)).toBeInTheDocument();
  });
});
