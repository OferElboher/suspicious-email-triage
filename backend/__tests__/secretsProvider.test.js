const {
  parseSecretsText,
  loadSecretsFromFile,
  resolveSecretsFilePath,
  createSecretsProvider,
  applySecretsToProcessEnv,
  secretBundleId,
} = require("../src/secrets/secretsProvider");

describe("secretsProvider", () => {
  it("parseSecretsText ignores comments and blank lines", () => {
    const parsed = parseSecretsText(`
# comment
JWT_SECRET=abc

POSTGRES_PASSWORD=xyz
`);
    expect(parsed.JWT_SECRET).toBe("abc");
    expect(parsed.POSTGRES_PASSWORD).toBe("xyz");
    expect(Object.keys(parsed)).toHaveLength(2);
  });

  it("loadSecretsFromFile reads ci.secrets fake credentials", () => {
    const path = require("path");
    const ciPath = path.resolve(__dirname, "../ci.secrets");
    const secrets = loadSecretsFromFile(ciPath);
    expect(secrets.JWT_SECRET).toContain("ci-fake");
    expect(secrets.POSTGRES_PASSWORD).toBeTruthy();
  });

  it("applySecretsToProcessEnv injects keys without logging values", () => {
    const prev = process.env.SECRETS_TEST_KEY;
    applySecretsToProcessEnv({ SECRETS_TEST_KEY: "injected" }, { override: true });
    expect(process.env.SECRETS_TEST_KEY).toBe("injected");
    if (prev === undefined) {
      delete process.env.SECRETS_TEST_KEY;
    } else {
      process.env.SECRETS_TEST_KEY = prev;
    }
  });

  it("secretBundleId defaults to triage/{deploymentEnv}", () => {
    const prev = process.env.SECRETS_BUNDLE_ID;
    delete process.env.SECRETS_BUNDLE_ID;
    expect(secretBundleId("staging")).toBe("triage/staging");
    if (prev) {
      process.env.SECRETS_BUNDLE_ID = prev;
    }
  });

  it("createSecretsProvider file mode resolves dev.secrets path", () => {
    process.env.SECRETS_PROVIDER = "file";
    const provider = createSecretsProvider({ deploymentEnv: "ci" });
    expect(provider.providerName).toBe("file");
    const filePath = resolveSecretsFilePath("ci");
    expect(filePath).toMatch(/ci\.secrets$/);
  });
});
