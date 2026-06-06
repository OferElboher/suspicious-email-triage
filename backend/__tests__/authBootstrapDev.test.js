jest.mock("../src/config/runtime", () => ({
  isDevDeployment: jest.fn(() => true),
}));

const {
  bootstrapCredentialsFromEnv,
  resetBootstrapAdminForDev,
} = require("../src/auth/authPg");
jest.mock("../src/auth/authPg", () => ({
  bootstrapCredentialsFromEnv: jest.fn(() => ({
    email: "admin@example.com",
    password: "temp-admin-pswd",
  })),
  resetBootstrapAdminForDev: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const authRoutes = require("../src/api/auth");
const { isDevDeployment } = require("../src/config/runtime");

/** Minimal app for dev bootstrap auth routes. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);
  return app;
}

describe("GET /auth/config dev login assist", () => {
  const app = buildApp();

  beforeEach(() => {
    isDevDeployment.mockReturnValue(true);
    bootstrapCredentialsFromEnv.mockReturnValue({
      email: "admin@example.com",
      password: "temp-admin-pswd",
    });
  });

  it("exposes masked bootstrap email and password hint in dev", async () => {
    const res = await request(app).get("/auth/config");
    expect(res.status).toBe(200);
    expect(res.body.devLoginAssist).toBe(true);
    expect(res.body.bootstrapEmailConfigured).toBe(true);
    expect(res.body.maskedBootstrapEmail).toBe("ad***@example.com");
    expect(res.body.bootstrapPasswordHint).toBe("temp-admin-pswd");
  });

  it("omits bootstrap hints when email is placeholder @local.test", async () => {
    bootstrapCredentialsFromEnv.mockReturnValue({
      email: "admin@local.test",
      password: "temp-admin-pswd",
    });
    const res = await request(app).get("/auth/config");
    expect(res.body.bootstrapEmailConfigured).toBe(false);
    expect(res.body.maskedBootstrapEmail).toBeNull();
  });
});

describe("POST /auth/dev/bootstrap-reset", () => {
  const app = buildApp();

  beforeEach(() => {
    isDevDeployment.mockReturnValue(true);
    resetBootstrapAdminForDev.mockReset();
    bootstrapCredentialsFromEnv.mockReturnValue({
      email: "admin@example.com",
      password: "temp-admin-pswd",
    });
  });

  it("resets bootstrap admin and returns password hint", async () => {
    resetBootstrapAdminForDev.mockResolvedValue({
      ok: true,
      action: "password_reset",
      email: "admin@example.com",
    });
    const res = await request(app).post("/auth/dev/bootstrap-reset").send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.action).toBe("password_reset");
    expect(res.body.passwordHint).toBe("temp-admin-pswd");
  });

  it("returns 400 when bootstrap email not configured", async () => {
    resetBootstrapAdminForDev.mockResolvedValue({
      ok: false,
      error: "bootstrap_email_not_configured",
    });
    const res = await request(app).post("/auth/dev/bootstrap-reset").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("bootstrap_email_not_configured");
  });

  it("returns 403 outside dev deployment", async () => {
    isDevDeployment.mockReturnValue(false);
    const res = await request(app).post("/auth/dev/bootstrap-reset").send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("dev_only");
    expect(resetBootstrapAdminForDev).not.toHaveBeenCalled();
  });
});
