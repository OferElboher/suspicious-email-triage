/**
 * Unified LLM provider for the legacy BullMQ worker (mirrors ai_service/app/llm_client.py).
 */
const logger = require("../lib/logger");

/** @returns {"disabled"|"ollama"|"mock_commercial"} */
function llmProvider() {
  if (process.env.DISABLE_LLM === "true") return "disabled";
  return (process.env.LLM_PROVIDER || "ollama").toLowerCase();
}

/** Build analyst prompt from Mongo review document. */
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

/** Normalize verdict → recommendedAction mapping for consistent UX. */
function enforceActions(parsed) {
  const response = { ...parsed };
  if (response.verdict === "benign") response.recommendedAction = "close";
  if (response.verdict === "suspicious") response.recommendedAction = "investigate";
  if (response.verdict === "likely_phishing") {
    response.recommendedAction = "report_and_block";
  }
  return response;
}

/** Parse JSON from model text; tolerate markdown wrappers. */
function parseModelJson(raw, reviewId) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw && raw.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn("llm", "invalid json from model", { id: reviewId });
      throw new Error("Invalid JSON returned from LLM");
    }
    return JSON.parse(match[0]);
  }
}

/** Deterministic stub when DISABLE_LLM=true. */
function disabledStub() {
  return {
    verdict: "benign",
    recommendedAction: "close",
    summary: "LLM disabled (stub)",
    findings: [],
    followUpQuestions: [],
  };
}

/** Call local Ollama /api/generate endpoint. */
async function analyzeWithOllama(review) {
  const url = process.env.OLLAMA_URL || "http://host.docker.internal:11434/api/generate";
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
  const parsed = parseModelJson(data.response, String(review._id));
  return enforceActions(parsed);
}

/** Call mock OpenAI-compatible server (Bearer LLM_API_KEY, zero cost). */
async function analyzeWithMockCommercial(review) {
  const base = (process.env.LLM_BASE_URL || "http://mock-llm:8090/v1").replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY || "dev-mock-key";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const temperature = Number(process.env.LLM_TEMPERATURE || 0.2);
  const maxTokens = Number(process.env.LLM_MAX_TOKENS || 512);
  const systemPrompt =
    process.env.LLM_SYSTEM_PROMPT ||
    "You are a cybersecurity email analyst. Respond with JSON only.";

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildPrompt(review) },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Mock commercial LLM HTTP ${res.status}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const parsed = parseModelJson(content, String(review._id));
  return enforceActions(parsed);
}

/** Factory: select provider from DISABLE_LLM / LLM_PROVIDER env. */
async function analyzeReview(review) {
  logger.info("llm", "call start", { id: String(review._id), provider: llmProvider() });
  const provider = llmProvider();
  if (provider === "disabled") return disabledStub();
  if (provider === "mock_commercial") return analyzeWithMockCommercial(review);
  return analyzeWithOllama(review);
}

module.exports = { analyzeReview, llmProvider, buildPrompt, enforceActions };
