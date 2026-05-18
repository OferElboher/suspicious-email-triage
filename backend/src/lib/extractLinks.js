/** Pull http(s) URLs from plain text for rule-engine domain checks. */
function extractLinks(text) {
  if (!text || typeof text !== "string") return [];
  const regex = /(https?:\/\/[^\s]+)/g;
  return text.match(regex) || [];
}

module.exports = { extractLinks };
