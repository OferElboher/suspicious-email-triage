const { extractLinks } = require("../src/lib/extractLinks");

describe("extractLinks", () => {
  it("collects unique http(s) URLs", () => {
    const text = "see https://a.com/x and http://b.org";
    const links = extractLinks(text);
    expect(links).toEqual(["https://a.com/x", "http://b.org"]);
  });

  it("returns empty for non-string", () => {
    expect(extractLinks(null)).toEqual([]);
  });
});
