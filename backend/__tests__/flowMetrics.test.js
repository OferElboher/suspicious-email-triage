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
  readSimulation: jest.fn(async () => ({ enabled: true, eventsPerMinute: 5 })),
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
const { getFlowDashboardSnapshot } = require("../src/metrics/flowMetrics");

describe("flowMetrics snapshot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Review.countDocuments.mockImplementation(async (filter) => {
      if (filter.status === "pending") return 3;
      if (filter.status === "processing") return 2;
      if (filter.status === "completed") return 10;
      if (filter.status === "failed") return 1;
      if (filter.createdAt) return 4;
      if (filter.status === "completed" && filter.updatedAt) return 2;
      return 0;
    });
  });

  it("getFlowDashboardSnapshot aggregates queue and gauge percents", async () => {
    const snap = await getFlowDashboardSnapshot();
    expect(snap.queue.pending).toBe(3);
    expect(snap.queue.total).toBe(16);
    expect(snap.rates.createdLastMinute).toBe(4);
    expect(snap.simulation.enabled).toBe(true);
    expect(snap.gauges.pendingPercent).toBeGreaterThan(0);
    expect(snap.clocks.uptimeSeconds).toBeGreaterThan(0);
  });
});
