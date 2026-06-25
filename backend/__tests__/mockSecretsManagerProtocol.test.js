/**
 * Protocol tests for mock AWS Secrets Manager — GetSecretValue response shape.
 * Technology: Node http server + supertest-style manual invoke of handleRequest.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const {
  buildSecretPayload,
  getSecretResponse,
  handleRequest,
  AWS_GET_SECRET_TARGET,
} = require("../../infra/mock-aws-secrets-manager/server");

describe("mock-aws-secrets-manager protocol", () => {
  it("buildSecretPayload matches AWS GetSecretValue field names", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mock-secrets-"));
    const filePath = path.join(tmpDir, "dev.secrets");
    fs.writeFileSync(filePath, "JWT_SECRET=test-key\n", "utf8");
    const payload = buildSecretPayload("triage/dev", filePath);
    expect(payload).toMatchObject({
      Name: "triage/dev",
      SecretString: expect.stringContaining("JWT_SECRET=test-key"),
      VersionId: expect.any(String),
      ARN: expect.stringContaining("arn:aws:secretsmanager"),
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("getSecretResponse returns ResourceNotFoundException shape for unknown id", () => {
    const result = getSecretResponse("triage/unknown");
    expect(result.status).toBe(404);
    expect(result.body.__type).toBe("ResourceNotFoundException");
  });

  it("handleRequest supports AWS JSON 1.1 POST GetSecretValue", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mock-secrets-root-"));
    process.env.SECRETS_ROOT = tmpRoot;
    fs.writeFileSync(path.join(tmpRoot, "ci.secrets"), "POSTGRES_PASSWORD=ci-fake\n", "utf8");

    const server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        res.writeHead(500);
        res.end(err.message);
      });
    });
    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();

    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": AWS_GET_SECRET_TARGET,
      },
      body: JSON.stringify({ SecretId: "triage/ci" }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.SecretString).toContain("POSTGRES_PASSWORD=ci-fake");

    server.close();
    delete process.env.SECRETS_ROOT;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });
});
