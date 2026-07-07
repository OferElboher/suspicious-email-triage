jest.mock("../src/models/Review", () => ({
  countDocuments: jest.fn(),
}));

jest.mock("../src/lib/appMetrics", () => ({
  _state: {
    httpRequestsTotal: 100,
    httpErrorsTotal: 1,
    reviewsCreatedTotal: 42,
    graphSyncFailuresTotal: 0,
    lastReadinessStatus: 1,
    startedAt: Date.now() - 3600_000,
  },
}));

jest.mock("../src/dev/simulationStore", () => ({
  readSimulation: jest.fn(async () => ({ enabled: true, eventsPerMinute: 30 })),
}));

jest.mock("../src/config/runtime", () => ({
  isDevDeployment: jest.fn(() => true),
}));

jest.mock("../src/search/reviewSearchIndex", () => ({
  getSearchIndexStats: jest.fn(async () => ({
    enabled: true,
    reachable: true,
    documentCount: 10,
  })),
}));

const Review = require("../src/models/Review");
const {
  getFlowDashboardSnapshot,
  activityPercent,
} = require("../src/metrics/flowMetrics");

describe("flowMetrics snapshot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Review.countDocuments.mockImplementation(async (filter) => {
      if (filter.status === "pending") return 2;
      if (filter.status === "processing") return 1;
      if (filter.status === "completed") return 5000;
      if (filter.status === "failed") return 0;
      if (filter.status === "completed" && filter.updatedAt) return 28;
      if (filter.createdAt) {
        const windowMs = Date.now() - filter.createdAt.$gte.getTime();
        if (windowMs <= 60_000) return 28;
        return 140;
      }
      return 0;
    });
  });

  it("getFlowDashboardSnapshot uses activity scales when completed history dominates", async () => {
    const snap = await getFlowDashboardSnapshot();
    expect(snap.queue.pending).toBe(2);
    expect(snap.queue.total).toBe(5003);
    expect(snap.rates.createdLastMinute).toBe(28);
    expect(snap.simulation.enabled).toBe(true);
    expect(snap.gauges.pendingPercent).toBe(0);
    expect(snap.gauges.pendingActivityPercent).toBeGreaterThan(0);
    expect(snap.gauges.ingestRatePercent).toBeGreaterThan(50);
    expect(snap.gauges.ingestGaugeMax).toBeGreaterThanOrEqual(28);
    expect(snap.clocks.uptimeSeconds).toBeGreaterThan(0);
  });

  it("activityPercent clamps to 100 and handles zero ceiling safely", () => {
    expect(activityPercent(30, 30)).toBe(100);
    expect(activityPercent(5, 0)).toBe(100);
    expect(activityPercent(0, 10)).toBe(0);
  });
});
