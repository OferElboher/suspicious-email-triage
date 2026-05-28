const { domainFromUrl } = require("../src/graph/domainFromUrl");

describe("domainFromUrl", () => {
  it("extracts hostname from https URLs", () => {
    expect(domainFromUrl("https://Login.evil.com/path?q=1")).toBe("login.evil.com");
  });

  it("returns null for invalid href", () => {
    expect(domainFromUrl("not-a-url")).toBeNull();
    expect(domainFromUrl("")).toBeNull();
  });

  it("rejects non-http schemes", () => {
    expect(domainFromUrl("ftp://files.example.com")).toBeNull();
  });
});
