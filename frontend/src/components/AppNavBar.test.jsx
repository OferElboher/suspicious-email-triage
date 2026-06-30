import { render, screen, fireEvent } from "@testing-library/react";
import AppNavBar from "./AppNavBar";

describe("AppNavBar", () => {
  it("renders only permitted icon tabs", () => {
    render(
      <AppNavBar
        screen="workspace"
        setScreen={() => {}}
        access={{
          workspace: true,
          analytics: false,
          graph: true,
          search: true,
          logs: false,
          admin: false,
          settings: true,
        }}
      />
    );
    expect(screen.getByRole("button", { name: /Review dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phishing graph/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search past reviews/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Analytics/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Search unified logs/i })).not.toBeInTheDocument();
  });

  it("calls setScreen when an icon is clicked", () => {
    const setScreen = jest.fn();
    render(
      <AppNavBar
        screen="workspace"
        setScreen={setScreen}
        access={{
          workspace: true,
          analytics: true,
          graph: false,
          logs: false,
          admin: false,
          settings: true,
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Analytics & graphs/i }));
    expect(setScreen).toHaveBeenCalledWith("analytics");
  });
});
