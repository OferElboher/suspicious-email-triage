jest.mock("../src/backups/s3BackupProvider", () => ({
  backupProviderMode: jest.fn(() => "mock-aws"),
  backupProviderStatus: jest.fn(() => ({
    enabled: true,
    provider: "mock-aws",
    bucket: "triage-dev-backups",
    endpoint: "http://mock-s3:4568",
  })),
  listBackupObjects: jest.fn(async () => ({
    bucket: "triage-dev-backups",
    prefix: "postgres/",
    items: [
      { key: "postgres/logical-2026-06-01.json", size: 2048, lastModified: "2026-06-01T12:00:00.000Z" },
      { key: "postgres/logical-2026-05-30.json", size: 1024, lastModified: "2026-05-30T12:00:00.000Z" },
    ],
  })),
}));

const { getBackupUsageSnapshot, formatBackupSize } = require("../src/backups/backupStats");

describe("backupStats", () => {
  it("formatBackupSize renders human-readable labels", () => {
    expect(formatBackupSize(512)).toBe("512 B");
    expect(formatBackupSize(2048)).toBe("2.0 KB");
    expect(formatBackupSize(2 * 1024 * 1024)).toBe("2.00 MB");
  });

  it("getBackupUsageSnapshot aggregates object list totals", async () => {
    const snap = await getBackupUsageSnapshot();
    expect(snap.provider).toBe("mock-aws");
    expect(snap.summary.objectCount).toBe(2);
    expect(snap.summary.totalSizeBytes).toBe(3072);
    expect(snap.summary.latestKey).toContain("2026-06-01");
    expect(snap.recentObjects).toHaveLength(2);
  });
});
