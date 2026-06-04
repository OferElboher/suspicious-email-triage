jest.mock("../src/auth/jwt", () => ({
  signAccessToken: jest.fn(() => "jwt-test-token"),
  jwtTtlSeconds: jest.fn(() => 3600),
}));

const { authenticateUser } = require("../src/auth/authPg");
jest.mock("../src/auth/authPg", () => ({
  authenticateUser: jest.fn(),
  getUserUiTheme: jest.fn(async () => "ocean-dark"),
}));

const request = require("supertest");
const express = require("express");
const authRoutes = require("../src/api/auth");

/** Minimal app mounting POST /auth/login for credential normalization tests. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);
  return app;
}

describe("POST /auth/login", () => {
  const app = buildApp();

  beforeEach(() => {
    authenticateUser.mockReset();
  });

  it("normalizes email (trim + lowercase) before authenticateUser", async () => {
    authenticateUser.mockResolvedValue({
      id: 1,
      email: "admin@local.test",
      roles: ["admin"],
      permissions: ["reviews.read"],
    });
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "  Admin@Local.TEST  ", password: "secret" });
    expect(res.status).toBe(200);
    expect(authenticateUser).toHaveBeenCalledWith("admin@local.test", "secret");
    expect(res.body.token).toBe("jwt-test-token");
  });

  it("returns invalid_credentials when authenticateUser returns null", async () => {
    authenticateUser.mockResolvedValue(null);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@local.test", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("rejects empty email or password", async () => {
    const res = await request(app).post("/auth/login").send({ email: "", password: "" });
    expect(res.status).toBe(400);
    expect(authenticateUser).not.toHaveBeenCalled();
  });
});
