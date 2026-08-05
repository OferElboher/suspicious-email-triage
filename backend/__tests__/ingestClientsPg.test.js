/** @jest-environment node */
/**
 * Unit tests for ingest_clients Postgres module (SQL shape validation via mocked pool).
 */
const mockQuery = jest.fn();

jest.mock("pg", () => ({
  Pool: jest.fn(() => ({ query: mockQuery })),
}));

describe("ingestClientsPg", () => {
  beforeEach(() => {
    jest.resetModules();
    mockQuery.mockReset();
  });

  it("ensureIngestClientsSchema creates table and seeds dev clients", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { ensureIngestClientsSchema } = require("../src/ingest/ingestClientsPg");
    await ensureIngestClientsSchema();
    expect(mockQuery).toHaveBeenCalled();
    const sql = mockQuery.mock.calls.map((c) => c[0]).join("\n");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ingest_clients/);
    expect(sql).toMatch(/dev-mock/);
  });

  it("upsertIngestClient rejects non-http callback URLs", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const { upsertIngestClient, ensureIngestClientsSchema } = require("../src/ingest/ingestClientsPg");
    await ensureIngestClientsSchema();
    await expect(
      upsertIngestClient({
        clientId: "bad",
        displayName: "Bad",
        callbackUrl: "ftp://nope.example/hook",
      })
    ).rejects.toThrow("callback_url_must_be_http_or_https");
  });
});
