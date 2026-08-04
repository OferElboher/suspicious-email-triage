"""Celery task: Kafka-dispatched review analysis (rules + LLM or agent triage) writes Mongo."""
from bson import ObjectId

from app.celery_app import celery_app
from app.graph_sync import sync_review_graph
from app.llm_client import analyze_with_llm
from app.logutil import log_line
from app.merge import merge_results
from app.mongo import get_db
from app.rule_engine import run_rule_engine
from app.stats import record_status
from app.verdict_delivery import notify_verdict_delivery

try:
    from app.agent.orchestrator import agent_triage_enabled, run_agent_triage
except ImportError:  # pragma: no cover — defensive import for partial deployments
    agent_triage_enabled = lambda: False  # noqa: E731
    run_agent_triage = None  # type: ignore[assignment]


@celery_app.task(name="analyze_review")
def analyze_review(review_id: str) -> str:
    db = get_db()
    log_line("info", "celery", "task start", reviewId=review_id)
    review = db.reviews.find_one({"_id": ObjectId(review_id)})
    if not review:
        log_line("error", "celery", "review missing", reviewId=review_id)
        return "missing"

    oid = review["_id"]
    db.reviews.update_one(
        {"_id": oid},
        {"$set": {"status": "processing"}},
    )
    # PostgreSQL keeps lightweight status events for charts; Mongo stores the review.
    record_status(review_id, "processing")
    agent_trace = None
    try:
        rules = run_rule_engine(review)
        if agent_triage_enabled() and run_agent_triage is not None:
            # Agent FSM: orchestration, tools, workflow, guardrails (data_guide_agent_triage.md).
            agent_result = run_agent_triage(review)
            llm = agent_result.structured_output
            agent_trace = agent_result.agent_trace
        else:
            llm = analyze_with_llm(review)
        result = merge_results(rules, llm)
        update_doc: dict = {"analysisResult": result, "status": "completed"}
        if agent_trace:
            update_doc["agentTrace"] = agent_trace
        db.reviews.update_one(
            {"_id": oid},
            {"$set": update_doc},
        )
        # Persist final chart status without scanning the Mongo review collection later.
        record_status(review_id, "completed", result.get("verdict"))
        # Re-sync Neo4j so verdict + campaign edges reflect analysis (non-fatal if graph down).
        sync_review_graph(review_id)
        # Outbound verdict webhook — mail platforms receive POST when callback URL configured.
        notify_verdict_delivery(review_id, reason="analysis_complete")
        log_line("info", "celery", "task done", reviewId=review_id)
        return "completed"
    except Exception as exc:  # noqa: BLE001 — surface failure to Mongo + logs
        log_line("error", "celery", "task failed", reviewId=review_id, error=str(exc))
        db.reviews.update_one(
            {"_id": oid},
            {"$set": {"status": "failed"}},
        )
        # Failed tasks are charted too, so operators can see worker issues.
        record_status(review_id, "failed")
        raise
