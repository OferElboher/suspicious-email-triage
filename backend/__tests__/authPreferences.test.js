jest.mock("../src/auth/jwt", () => ({
  verifyAccessToken: jest.fn(() => ({ sub: 1, email: "user@test.local" })),
  signAccessToken: jest.fn(),
  jwtTtlSeconds: jest.fn(() => 3600),
}));

jest.mock("../src/auth/authPg", () => ({
  findUserById: jest.fn(async () => ({
    id: 1,
    email: "user@test.local",
    is_active: true,
    ui_theme: "ocean-dark",
  })),
  loadUserAccess: jest.fn(async () => ({
    roles: ["analyst"],
    permissions: ["reviews.read"],
  })),
  getUserUiTheme: jest.fn(async () => "ocean-dark"),
  setUserUiTheme: jest.fn(async (_id, theme) => theme),
}));

const request = require("supertest");
const express = require("express");
const authRoutes = require("../src/api/auth");
const { setUserUiTheme } = require("../src/auth/authPg");

/** Mount auth router with bearer token (authenticate on /preferences). */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);
  return app;
}

describe("auth preferences API", () => {
  const app = buildApp();
  const authHeader = { Authorization: "Bearer test-token" };

  it("GET /auth/preferences returns catalog and current theme", async () => {
    const res = await request(app).get("/auth/preferences").set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.uiTheme).toBe("ocean-dark");
    expect(Array.isArray(res.body.themes)).toBe(true);
    expect(res.body.themes.length).toBeGreaterThan(10);
  });

  it("PUT /auth/preferences rejects invalid theme", async () => {
    const res = await request(app)
      .put("/auth/preferences")
      .set(authHeader)
      .send({ uiTheme: "not-a-real-theme" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_ui_theme");
  });

  it("PUT /auth/preferences persists valid theme", async () => {
    const res = await request(app)
      .put("/auth/preferences")
      .set(authHeader)
      .send({ uiTheme: "nord" });
    expect(res.status).toBe(200);
    expect(setUserUiTheme).toHaveBeenCalledWith(1, "nord");
    expect(res.body.uiTheme).toBe("nord");
  });
});
