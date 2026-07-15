/** Tests for documentation secret-pattern scanner (GitHub alert prevention). */

const fs = require("fs");
const path = require("path");
const {
  findForbiddenDocSecretPatterns,
  scanDocsDirectoryForSecrets,
  scanTextFilesForSecrets,
} = require("../src/lib/docSecretScan");
const {
  decodeDocSecretFixture,
  FIXTURE_B64,
} = require("./helpers/docSecretScanFixtures");

describe("docSecretScan", () => {
  it("flags MongoDB Atlas URIs with embedded credentials", () => {
    const bad = decodeDocSecretFixture("atlasUriEnvLine");
    const hits = findForbiddenDocSecretPatterns(bad);
    expect(hits.some((h) => h.name === "mongodb_atlas_uri_with_credentials")).toBe(true);
  });

  it("allows local dev postgres Compose default (triage:triage@postgres:5432)", () => {
    const ok = "STATISTICS_PG_URL=postgres://triage:triage@postgres:5432/triage_stats";
    const hits = findForbiddenDocSecretPatterns(ok);
    expect(hits).toEqual([]);
  });

  it("flags staging postgres URIs with passwords", () => {
    const bad = decodeDocSecretFixture("stagingPostgresUri");
    const hits = findForbiddenDocSecretPatterns(bad);
    expect(hits.some((h) => h.name === "postgres_uri_with_credentials")).toBe(true);
  });

  it("flags OpenAI-style sk- key prefixes", () => {
    const bad = decodeDocSecretFixture("openAiKeyEnvLine");
    const hits = findForbiddenDocSecretPatterns(bad);
    expect(hits.some((h) => h.name === "openai_api_key_prefix")).toBe(true);
  });

  it("reports no violations for real docs tree", () => {
    const docsDir = path.resolve(__dirname, "../../docs");
    const results = scanDocsDirectoryForSecrets(docsDir);
    expect(results).toEqual([]);
  });

  it("scanDocsDirectoryForSecrets detects injected bad content via mock fs", () => {
    const injected = decodeDocSecretFixture("atlasUriBare");
    const mockFs = {
      existsSync: () => true,
      readdirSync: () => [{ isFile: () => true, name: "bad.md" }],
      readFileSync: () => injected,
    };
    const results = scanDocsDirectoryForSecrets("/fake/docs", {
      fs: mockFs,
      path: require("path"),
    });
    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("bad.md");
    expect(results[0].violations[0].name).toBe("mongodb_atlas_uri_with_credentials");
  });

  it("fixture helper file contains only base64 (safe for GitHub secret scanning)", () => {
    const fixturePath = path.join(__dirname, "helpers/docSecretScanFixtures.js");
    const raw = fs.readFileSync(fixturePath, "utf8");
    const hits = findForbiddenDocSecretPatterns(raw);
    expect(hits).toEqual([]);
    expect(Object.keys(FIXTURE_B64).length).toBeGreaterThan(0);
  });

  it("scanTextFilesForSecrets scans arbitrary committed paths", () => {
    const docsReadme = path.resolve(__dirname, "../../docs/README.md");
    const results = scanTextFilesForSecrets([docsReadme]);
    expect(results).toEqual([]);
  });
});
