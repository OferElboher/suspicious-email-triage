import { readScreenFromLocation, writeScreenToLocation } from "../lib/appScreenNavigation";

describe("appScreenNavigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  test("readScreenFromLocation defaults to workspace", () => {
    expect(readScreenFromLocation()).toBe("workspace");
  });

  test("readScreenFromLocation reads analytics hash", () => {
    window.location.hash = "#analytics";
    expect(readScreenFromLocation()).toBe("analytics");
    window.location.hash = "#graph";
    expect(readScreenFromLocation()).toBe("graph");
    window.location.hash = "#legacy-admin";
    expect(readScreenFromLocation()).toBe("workspace");
  });

  test("writeScreenToLocation updates hash for non-workspace views", () => {
    writeScreenToLocation("analytics");
    expect(window.location.hash).toBe("#analytics");
    writeScreenToLocation("workspace");
    expect(window.location.hash).toBe("");
  });
});
