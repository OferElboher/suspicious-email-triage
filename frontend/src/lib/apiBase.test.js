import { resolveApiBase, resolveOAuthApiBase, buildNetworkError } from "./apiBase";

describe("apiBase helpers", () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
  });

  afterAll(() => {
    process.env = env;
  });

  it("uses empty base in development when REACT_APP_API_URL unset (CRA proxy)", () => {
    delete process.env.REACT_APP_API_URL;
    process.env.NODE_ENV = "development";
    expect(resolveApiBase()).toBe("");
  });

  it("always uses CRA proxy in development even if REACT_APP_API_URL is set", () => {
    process.env.REACT_APP_API_URL = "http://localhost:3000";
    process.env.NODE_ENV = "development";
    expect(resolveApiBase()).toBe("");
  });

  it("prefers explicit REACT_APP_API_URL in production builds", () => {
    process.env.REACT_APP_API_URL = "https://api.example.com";
    process.env.NODE_ENV = "production";
    expect(resolveApiBase()).toBe("https://api.example.com");
  });

  it("defaults production build to localhost:3000", () => {
    delete process.env.REACT_APP_API_URL;
    process.env.NODE_ENV = "production";
    expect(resolveApiBase()).toBe("http://localhost:3000");
  });

  it("resolveOAuthApiBase always returns absolute API URL for browser redirects", () => {
    delete process.env.REACT_APP_API_URL;
    expect(resolveOAuthApiBase()).toBe("http://localhost:3000");
  });

  it("buildNetworkError marks network failures with actionable text", () => {
    const err = buildNetworkError(new Error("Failed to fetch"), "");
    expect(err.networkError).toBe(true);
    expect(err.message).toMatch(/port 3000/);
  });
});
