import { render, screen, fireEvent } from "@testing-library/react";
import HoverHelp from "./HoverHelp";

describe("HoverHelp", () => {
  it("shows tooltip text on mouse enter", () => {
    render(
      <HoverHelp text="Helpful explanation">
        <button type="button">Action</button>
      </HoverHelp>
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Action" }), {
      clientX: 100,
      clientY: 200,
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Helpful explanation");
  });

  it("hides tooltip on mouse leave", () => {
    render(
      <HoverHelp text="Helpful explanation">
        <button type="button">Action</button>
      </HoverHelp>
    );
    const btn = screen.getByRole("button", { name: "Action" });
    fireEvent.mouseEnter(btn, { clientX: 10, clientY: 10 });
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("uses nav styling and above placement when requested", () => {
    render(
      <HoverHelp text="Review dashboard" placement="above">
        <button type="button">Nav</button>
      </HoverHelp>
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Nav" }));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveClass("hover-help__popup--nav");
    expect(tip).toHaveTextContent("Review dashboard");
  });
});
