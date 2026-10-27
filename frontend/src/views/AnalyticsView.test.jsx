import { render, screen } from "@testing-library/react";
import * as client from "../api/client";
import AnalyticsView from "./AnalyticsView";

describe("AnalyticsView", () => {
  beforeEach(() => {
    jest.spyOn(client, "getJson").mockImplementation(async (path) => {
      if (path.includes("/metrics/timeseries")) {
        return { series: [{ t: "2026-01-01T00:00:00.000Z", count: 1 }] };
      }
      if (path.includes("/metrics/status-breakdown")) {
        return { breakdown: [{ status: "pending", count: 2 }] };
      }
      if (path.includes("prefect-health")) {
        return {
          hours: 24,
          eventCount: 0,
          status: "ok",
          source: "test",
          flowName: "review-stats-health-check",
        };
      }
      if (path.includes("dbt-daily")) {
        return { project: "triage_dbt_demo", materialization: "view", rows: [] };
      }
      throw new Error(`unexpected ${path}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts with auto-refresh enabled so charts poll by default", async () => {
    render(<AnalyticsView />);
    expect(
      await screen.findByRole("button", { name: /Auto-refresh: on/i })
    ).toBeInTheDocument();
  });
});
