/** Tests for documentation secret-pattern scanner (GitHub alert prevention). */

const path = require("path");
const {
  findForbiddenDocSecretPatterns,
  scanDocsDirectoryForSecrets,
} = require("../src/lib/docSecretScan");

describe("docSecretScan", () => {
  it("flags MongoDB Atlas URIs with embedded credentials", () => {
    const bad =
      "MONGO_URI=mongodb+srv://triage_app:SECRET@cluster.xxxxx.mongodb.net/triage_staging";
    const hits = findForbiddenDocSecretPatterns(bad);
    expect(hits.some((h) => h.name === "mongodb_atlas_uri_with_credentials")).toBe(true);
  });

  it("allows local dev postgres://triage:triage@postgres Compose default", () => {
    const ok = "STATISTICS_PG_URL=postgres://triage:triage@postgres:5432/triage_stats";
    const hits = findForbiddenDocSecretPatterns(ok);
    expect(hits).toEqual([]);
  });

  it("flags staging postgres URIs with passwords", () => {
    const bad =
      "postgres://STAGING_USER:STAGING_PASS@staging-postgres.example.net:5432/triage_stats";
    const hits = findForbiddenDocSecretPatterns(bad);
    expect(hits.some((h) => h.name === "postgres_uri_with_credentials")).toBe(true);
  });

  it("flags OpenAI-style sk- key prefixes", () => {
    const hits = findForbiddenDocSecretPatterns("LLM_API_KEY=sk-abcdefghijklmnopqrstuvwxyz");
    expect(hits.some((h) => h.name === "openai_api_key_prefix")).toBe(true);
  });

  it("reports no violations for real docs tree", () => {
    const docsDir = path.resolve(__dirname, "../../docs");
    const results = scanDocsDirectoryForSecrets(docsDir);
    expect(results).toEqual([]);
  });

  it("scanDocsDirectoryForSecrets detects injected bad content via mock fs", () => {
    const mockFs = {
      existsSync: () => true,
      readdirSync: () => [{ isFile: () => true, name: "bad.md" }],
      readFileSync: () =>
        "mongodb+srv://user:pass@host.mongodb.net/db",
    };
    const results = scanDocsDirectoryForSecrets("/fake/docs", {
      fs: mockFs,
      path: require("path"),
    });
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("bad.md");
    expect(results[0].violations[0].name).toBe("mongodb_atlas_uri_with_credentials");
  });
});
