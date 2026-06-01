import { render, screen, fireEvent } from "@testing-library/react";
import PasswordInput from "./PasswordInput";

describe("PasswordInput", () => {
  it("toggles password visibility when Show/Hide is clicked", () => {
    render(
      <PasswordInput
        label="Password"
        value="secret"
        onChange={() => {}}
      />
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(input).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(input).toHaveAttribute("type", "password");
  });
});
