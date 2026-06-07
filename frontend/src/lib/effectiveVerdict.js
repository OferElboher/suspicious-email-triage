/**
 * Client-side mirror of backend effectiveVerdict — override beats automated analysis.
 */

/** @returns {string} Verdict label for list rows and detail panels. */
export function effectiveVerdict(review) {
  return review?.override?.verdict || review?.analysisResult?.verdict || "—";
}

/** @returns {boolean} True when an analyst override is stored on the review. */
export function hasOverride(review) {
  return Boolean(review?.override?.verdict);
}
