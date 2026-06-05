/**
 * Deterministic rules; security-critical outcomes must not be weakened by LLM output downstream.
 */
/** Host substrings aligned with mock_commercial_llm demo URLs (graph campaign tests). */
const PHISHING_URL_HINTS = [
  "example-phish",
  "phish.test",
  "secure-login",
  "malware",
  "evil.com",
];

function runRuleEngine(review) {
  const text = `${review.subject} ${review.body}`.toLowerCase();
  let verdict = "benign";
  let recommendedAction = "close";
  const findings = [];
  const followUpQuestions = [];

  if (PHISHING_URL_HINTS.some((hint) => text.includes(hint))) {
    verdict = "likely_phishing";
    recommendedAction = "report_and_block";
    findings.push({
      severity: "high",
      explanation: "URL hostname matches phishing-demo indicators",
      evidence: review.body.slice(0, 120),
    });
  }

  if (
    text.includes("password") ||
    text.includes("mfa") ||
    text.includes("credit card") ||
    text.includes("verify account")
  ) {
    verdict = "likely_phishing";
    recommendedAction = "report_and_block";
    findings.push({
      severity: "high",
      explanation: "Credential or sensitive data request detected",
      evidence: review.body.slice(0, 120),
    });
  }

  if (text.includes("urgent") && review.body.includes("http")) {
    verdict = verdict === "benign" ? "suspicious" : verdict;
    recommendedAction = "investigate";
    findings.push({
      severity: "high",
      explanation: "Urgent language combined with external link",
      evidence: review.body.slice(0, 120),
    });
  }

  if (review.links && review.links.length > 0) {
    try {
      const senderDomain = review.senderEmail.split("@")[1];
      review.links.forEach((link) => {
        try {
          const url = new URL(link);
          const linkDomain = url.hostname;
          if (!linkDomain.includes(senderDomain)) {
            findings.push({
              severity: "high",
              explanation: "Link domain does not match sender domain",
              evidence: `${linkDomain} vs ${senderDomain}`,
            });
            if (verdict === "benign") {
              verdict = "suspicious";
              recommendedAction = "investigate";
            }
          }
        } catch {
          /* malformed URL */
        }
      });
    } catch {
      /* malformed sender */
    }
  }

  const trustedSource = (review.referenceSources || []).find(
    (src) => src.title && src.title.toLowerCase().includes("trusted")
  );
  if (trustedSource) {
    const trustedDomains = trustedSource.content
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean);
    try {
      const senderDomain = review.senderEmail.split("@")[1];
      const senderTrusted = trustedDomains.some((d) =>
        senderDomain.includes(d)
      );
      const linkTrusted = (review.links || []).some((link) => {
        try {
          const domain = new URL(link).hostname;
          return trustedDomains.some((d) => domain.includes(d));
        } catch {
          return false;
        }
      });
      if (!senderTrusted && !linkTrusted) {
        findings.push({
          severity: "medium",
          explanation: "Sender and links do not match trusted domains list",
          evidence: `sender: ${senderDomain}`,
        });
        if (verdict === "benign") {
          verdict = "suspicious";
          recommendedAction = "investigate";
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (findings.length === 0) {
    followUpQuestions.push(
      "Is this email expected?",
      "Do you recognize the sender?"
    );
    recommendedAction = "investigate";
  }

  return { verdict, recommendedAction, findings, followUpQuestions };
}

module.exports = { runRuleEngine };
