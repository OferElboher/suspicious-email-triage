import { DEFAULT_THEME, THEMES, applyThemeToDocument, isValidTheme, mergeThemeCatalogs } from "./themes";

describe("theme catalog", () => {
  it("includes light, dark, bw, and colorful themes", () => {
    const categories = new Set(THEMES.map((t) => t.category));
    expect(categories.has("light")).toBe(true);
    expect(categories.has("dark")).toBe(true);
    expect(categories.has("bw")).toBe(true);
    expect(categories.has("colorful")).toBe(true);
    expect(THEMES.length).toBeGreaterThanOrEqual(16);
  });

  it("validates theme ids including spring-blossom", () => {
    expect(isValidTheme("nord")).toBe(true);
    expect(isValidTheme("spring-blossom")).toBe(true);
    expect(isValidTheme("invalid")).toBe(false);
    expect(isValidTheme("")).toBe(false);
  });

  it("applyThemeToDocument sets data-theme on html element", () => {
    const applied = applyThemeToDocument("dracula");
    expect(applied).toBe("dracula");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dracula");
    applyThemeToDocument(DEFAULT_THEME);
  });

  it("mergeThemeCatalogs keeps bundled themes when API omits newer ids", () => {
    const staleServer = THEMES.filter((entry) => entry.id !== "spring-blossom");
    const merged = mergeThemeCatalogs(staleServer);
    const blossom = merged.find((entry) => entry.id === "spring-blossom");
    expect(blossom).toBeDefined();
    expect(blossom.label).toMatch(/Spring blossom/i);
    expect(merged.length).toBe(THEMES.length);
  });

  it("mergeThemeCatalogs overlays server labels onto bundled entries", () => {
    const server = [{ id: "nord", label: "Nord (from API)", category: "dark" }];
    const merged = mergeThemeCatalogs(server);
    expect(merged.find((entry) => entry.id === "nord").label).toBe("Nord (from API)");
  });
});
