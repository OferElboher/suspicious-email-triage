/**
 * Pagination helpers for jumping to a calendar date in sorted lists.
 * Reviews sort by updatedAt DESC — page is count of newer rows divided by page size.
 */

/** Parse YYYY-MM-DD into UTC day bounds (inclusive end). */
function dayBoundsUtc(dateStr) {
  const normalized = String(dateStr || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }
  const start = new Date(`${normalized}T00:00:00.000Z`);
  const end = new Date(`${normalized}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return { start, end, date: normalized };
}

/**
 * Zero-based page index for the first row on `date` when sorted newest-first.
 * @param {number} newerCount — documents with updatedAt after end of day
 * @param {number} pageSize
 */
function pageIndexForDate(newerCount, pageSize) {
  const size = Math.max(1, Number(pageSize) || 1);
  return Math.max(0, Math.floor(Number(newerCount) / size));
}

module.exports = { dayBoundsUtc, pageIndexForDate };
