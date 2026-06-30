const { REVIEW_STATS_DAILY_VIEW_SQL, DBT_VIEW_NAME } = require("../src/pipeline/dbtViewSql");
const fs = require("fs");
const path = require("path");

describe("dbt view SQL sync", () => {
  it("matches dbt model intent (date_trunc daily rollup)", () => {
    expect(DBT_VIEW_NAME).toBe("review_stats_daily");
    expect(REVIEW_STATS_DAILY_VIEW_SQL).toMatch(/date_trunc\('day', occurred_at\)/);
    expect(REVIEW_STATS_DAILY_VIEW_SQL).toMatch(/review_stats_events/);
  });

  it("stays aligned with orchestration/dbt_demo/models/review_stats_daily.sql", () => {
    const dbtFile = path.resolve(
      __dirname,
      "../../orchestration/dbt_demo/models/review_stats_daily.sql"
    );
    const raw = fs.readFileSync(dbtFile, "utf8");
    expect(raw).toMatch(/stats_day/);
    expect(raw).toMatch(/event_count/);
    expect(REVIEW_STATS_DAILY_VIEW_SQL).toContain("stats_day");
    expect(REVIEW_STATS_DAILY_VIEW_SQL).toContain("event_count");
  });
});
