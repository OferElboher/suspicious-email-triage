/**
 * BullMQ job body: load review, rules + LLM, persist. Used when USE_BULLMQ_ENQUEUE=true.
 */
const Review = require("../models/Review");
const logger = require("../lib/logger");
const { analyzeReview } = require("../llm/analyzeReview");
const { runRuleEngine } = require("./ruleEngine");

function normalizeSeverity(s) {
  if (s === "critical" || s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

function mergeHybrid(ruleOutcome, llmResult) {
  const { verdict, findings, followUpQuestions } = ruleOutcome;
  const finalVerdict = llmResult.verdict || verdict;
  const finalAction =
    finalVerdict === "benign"
      ? "close"
      : finalVerdict === "suspicious"
        ? "investigate"
        : "report_and_block";

  const mergedFindings = [
    ...findings.map((f) => ({
      explanation: String(f?.explanation ?? ""),
      severity: normalizeSeverity(f?.severity),
      evidence: f?.evidence,
    })),
    ...(Array.isArray(llmResult.findings)
      ? llmResult.findings.map((f) => ({
          explanation: String(f?.explanation ?? ""),
          severity: normalizeSeverity(f?.severity),
          evidence: f?.evidence,
        }))
      : []),
  ];

  return {
    verdict: finalVerdict,
    recommendedAction: finalAction,
    summary: llmResult.summary,
    findings: mergedFindings,
    followUpQuestions:
      followUpQuestions.length > 0
        ? followUpQuestions
        : llmResult.followUpQuestions || [],
  };
}

async function processReviewJob(reviewId) {
  let review;
  try {
    review = await Review.findById(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    review.status = "processing";
    await review.save();
    logger.info("worker", "processing", { reviewId });

    const ruleOutcome = runRuleEngine(review);
    if (process.env.REACT_APP_DEBUG_MODE === "true") {
      await new Promise((r) => setTimeout(r, 5000));
    }
    const llmResult = await analyzeReview(review);
    review.analysisResult = mergeHybrid(ruleOutcome, llmResult);
    review.status = "completed";
    await review.save();
    logger.info("worker", "completed", { reviewId });
    return { reviewId, status: "completed" };
  } catch (err) {
    logger.error("worker", "job failed", { reviewId, error: err.message });
    if (review) {
      review.status = "failed";
      await review.save();
    }
    throw err;
  }
}

module.exports = { processReviewJob };
