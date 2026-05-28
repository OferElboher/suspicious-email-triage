/**
 * Parse a hostname from an http(s) URL string for Neo4j Domain nodes.
 * Uses the WHATWG URL parser so punycode and ports are handled consistently.
 */

/** Return lowercase host or null when the href is not a valid absolute URL. */
function domainFromUrl(href) {
  if (!href || typeof href !== "string") {
    return null;
  }
  try {
    const parsed = new URL(href.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.hostname.toLowerCase();
  } catch (_err) {
    return null;
  }
}

module.exports = { domainFromUrl };
