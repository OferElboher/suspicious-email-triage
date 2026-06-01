import { DEFAULT_THEME, THEMES, applyThemeToDocument, isValidTheme } from "./themes";

describe("theme catalog", () => {
  it("includes light, dark, bw, and colorful themes", () => {
    const categories = new Set(THEMES.map((t) => t.category));
    expect(categories.has("light")).toBe(true);
    expect(categories.has("dark")).toBe(true);
    expect(categories.has("bw")).toBe(true);
    expect(categories.has("colorful")).toBe(true);
    expect(THEMES.length).toBeGreaterThanOrEqual(16);
  });

  it("validates theme ids", () => {
    expect(isValidTheme("nord")).toBe(true);
    expect(isValidTheme("invalid")).toBe(false);
    expect(isValidTheme("")).toBe(false);
  });

  it("applyThemeToDocument sets data-theme on html element", () => {
    const applied = applyThemeToDocument("dracula");
    expect(applied).toBe("dracula");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dracula");
    applyThemeToDocument(DEFAULT_THEME);
  });
});
