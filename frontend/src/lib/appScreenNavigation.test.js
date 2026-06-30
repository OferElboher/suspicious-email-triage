import { readScreenFromLocation, writeScreenToLocation, APP_SCREENS } from "../lib/appScreenNavigation";

describe("appScreenNavigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  test("APP_SCREENS includes search, logs, settings, and admin", () => {
    expect(APP_SCREENS).toEqual(
      expect.arrayContaining(["search", "logs", "settings", "admin"])
    );
  });

  test("readScreenFromLocation defaults to workspace", () => {
    expect(readScreenFromLocation()).toBe("workspace");
  });

  test("readScreenFromLocation reads hash routes", () => {
    window.location.hash = "#analytics";
    expect(readScreenFromLocation()).toBe("analytics");
    window.location.hash = "#graph";
    expect(readScreenFromLocation()).toBe("graph");
    window.location.hash = "#search";
    expect(readScreenFromLocation()).toBe("search");
    window.location.hash = "#logs";
    expect(readScreenFromLocation()).toBe("logs");
    window.location.hash = "#settings";
    expect(readScreenFromLocation()).toBe("settings");
    window.location.hash = "#legacy-admin";
    expect(readScreenFromLocation()).toBe("workspace");
  });

  test("writeScreenToLocation updates hash for non-workspace views", () => {
    writeScreenToLocation("analytics");
    expect(window.location.hash).toBe("#analytics");
    writeScreenToLocation("logs");
    expect(window.location.hash).toBe("#logs");
    writeScreenToLocation("workspace");
    expect(window.location.hash).toBe("");
  });
});
