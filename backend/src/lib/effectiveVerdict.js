/**
 * Resolve the verdict shown to analysts and Neo4j after optional manual override.
 * Pattern: analyst override wins over automated analysisResult (audit trail preserved).
 */

/** @returns {string|null} Effective verdict for display, search, and graph sync. */
function effectiveVerdict(review) {
  if (!review) {
    return null;
  }
  return review.override?.verdict || review.analysisResult?.verdict || null;
}

/** @returns {string|null} Effective recommended action (override first). */
function effectiveRecommendedAction(review) {
  if (!review) {
    return null;
  }
  return (
    review.override?.recommendedAction ||
    review.analysisResult?.recommendedAction ||
    null
  );
}

module.exports = { effectiveVerdict, effectiveRecommendedAction };
