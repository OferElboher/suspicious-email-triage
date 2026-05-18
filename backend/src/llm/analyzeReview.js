/**
 * Ollama JSON generate; rules in worker mergeHybrid still constrain UX-facing verdict.
 * DISABLE_LLM=true returns a benign-shaped stub for CI/offline.
 */
const logger = require("../lib/logger");

function buildPrompt(review) {
  return `
You are a cybersecurity analyst.
Analyze the following email and return STRICT JSON only.
Sender: ${review.senderEmail}
Subject: ${review.subject}
Body: ${review.body}
Return format:
{
  "verdict": "benign | suspicious | likely_phishing",
  "recommendedAction": "close | investigate | report_and_block",
  "summary": "short explanation",
  "findings": [{"severity":"low|medium|high","explanation":"reason","evidence":"quote"}],
  "followUpQuestions": []
}`;
}

function enforceActions(parsed) {
  const response = { ...parsed };
  if (response.verdict === "benign") response.recommendedAction = "close";
  if (response.verdict === "suspicious") response.recommendedAction = "investigate";
  if (response.verdict === "likely_phishing") {
    response.recommendedAction = "report_and_block";
  }
  return response;
}

async function analyzeReview(review) {
  logger.info("llm", "call start", { id: String(review._id) });
  if (process.env.DISABLE_LLM === "true") {
    return {
      verdict: "benign",
      recommendedAction: "close",
      summary: "LLM disabled (stub)",
      findings: [],
      followUpQuestions: [],
    };
  }

  const url =
    process.env.OLLAMA_URL || "http://host.docker.internal:11434/api/generate";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "llama3",
      prompt: buildPrompt(review),
      stream: false,
      format: "json",
    }),
  });
  const data = await res.json();
  let raw = data.response;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw && raw.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn("llm", "invalid json from model", { id: String(review._id) });
      throw new Error("Invalid JSON returned from LLM");
    }
    parsed = JSON.parse(match[0]);
  }
  logger.info("llm", "call success", { id: String(review._id) });
  return enforceActions(parsed);
}

module.exports = { analyzeReview };
