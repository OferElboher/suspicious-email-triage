import { render, screen } from "@testing-library/react";
import * as client from "../api/client";
import PipelineOrchestrationPanel from "./PipelineOrchestrationPanel";

describe("PipelineOrchestrationPanel", () => {
  beforeEach(() => {
    jest.spyOn(client, "getJson").mockImplementation(async (path) => {
      if (path.includes("prefect-health")) {
        return {
          hours: 24,
          eventCount: 5,
          status: "ok",
          source: "prefect-flow",
          flowName: "review-stats-health-check",
        };
      }
      if (path.includes("dbt-daily")) {
        return {
          project: "triage_dbt_demo",
          materialization: "view",
          rows: [{ label: "Jan 1", event_count: 3, stats_day: "2026-01-01T00:00:00.000Z" }],
        };
      }
      throw new Error(`unexpected path ${path}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows Prefect flow metrics and dbt model title", async () => {
    render(<PipelineOrchestrationPanel />);
    expect(
      await screen.findByRole("heading", { name: /Prefect — review-stats-health-check/i })
    ).toBeInTheDocument();
    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /dbt — review_stats_daily model/i })).toBeInTheDocument();
    expect(screen.getByText("prefect-flow")).toBeInTheDocument();
  });
});
