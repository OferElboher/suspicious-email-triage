import { render, screen, within } from "@testing-library/react";
import SettingsView from "../views/SettingsView";

jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "a@test.com", roles: ["analyst"], permissions: ["reviews.read"] },
  }),
}));

jest.mock("../context/ThemeContext", () => ({
  useTheme: () => ({
    themeId: "default-light",
    themes: [{ id: "default-light", label: "Default light", category: "light" }],
    setThemeId: jest.fn(),
    loading: false,
  }),
}));

describe("SettingsView", () => {
  it("renders theme selector and account summary", () => {
    render(<SettingsView onSignOut={() => {}} />);
    expect(screen.getByRole("heading", { name: /Settings/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Color theme/i)).toBeInTheDocument();
    expect(screen.getByText(/a@test.com/)).toBeInTheDocument();
  });

  it("stacks Theme selector under Appearance heading (label above select)", () => {
    render(<SettingsView onSignOut={() => {}} />);
    const appearance = screen.getByTestId("settings-panel-appearance");
    expect(within(appearance).getByRole("heading", { name: /Appearance/i })).toBeInTheDocument();
    expect(within(appearance).getByText("Theme")).toBeInTheDocument();
    expect(within(appearance).getByLabelText(/Color theme/i)).toBeInTheDocument();
  });
});
