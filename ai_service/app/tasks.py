"""Celery task: Kafka-dispatched review analysis (NLP/LLM scoring) writes Mongo."""
from bson import ObjectId

from app.celery_app import celery_app
from app.logutil import log_line
from app.mongo import get_db
from app.rule_engine import run_rule_engine
from app.llm_ollama import analyze_with_ollama
from app.merge import merge_results
from app.stats import record_status


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
    try:
        rules = run_rule_engine(review)
        llm = analyze_with_ollama(review)
        result = merge_results(rules, llm)
        db.reviews.update_one(
            {"_id": oid},
            {"$set": {"analysisResult": result, "status": "completed"}},
        )
        # Persist final chart status without scanning the Mongo review collection later.
        record_status(review_id, "completed", result.get("verdict"))
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
