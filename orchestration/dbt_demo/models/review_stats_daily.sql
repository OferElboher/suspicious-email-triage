-- dbt demo model: daily ingest counts from review_stats_events (analytics orchestration talking point).
-- Materialized as VIEW in dev; production would use incremental/table materialization.

SELECT
    date_trunc('day', occurred_at) AS stats_day,
    COUNT(*)::bigint AS event_count
FROM {{ source('triage_stats', 'review_stats_events') }}
GROUP BY 1
ORDER BY 1
