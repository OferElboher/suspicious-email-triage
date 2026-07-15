/**
 * Documentation secret-pattern scanner — prevents credential-like strings in committed Markdown.
 *
 * GitHub secret scanning flags patterns such as MongoDB Atlas URIs with embedded passwords.
 * Guides must reference env var names and *.secrets.example templates instead of inline URIs.
 */

/** @typedef {{ name: string, regex: RegExp, allow?: (match: string) => boolean }} DocSecretPattern */

/**
 * Patterns that must not appear in docs/*.md (except documented dev-only docker defaults).
 * Each entry includes an optional allow() predicate for known-safe matches.
 * @type {DocSecretPattern[]}
 */
const DOC_SECRET_PATTERNS = [
  {
    name: "mongodb_atlas_uri_with_credentials",
    // Atlas-style SRV URI with user:password@host — triggers GitHub secret alerts.
    regex: /mongodb\+srv:\/\/[^/\s\n]+:[^@\s\n]+@[^\s\n]+/gi,
  },
  {
    name: "postgres_uri_with_credentials",
    regex: /postgres:\/\/[^/\s\n]+:[^@\s\n]+@[^\s\n]+/gi,
    /** Local Compose defaults (triage:triage@postgres|localhost) are documented dev values. */
    allow: (match) =>
      /^postgres:\/\/triage:triage@(postgres|localhost):5432\//i.test(match.trim()),
  },
  {
    name: "openai_api_key_prefix",
    regex: /sk-[a-zA-Z0-9]{8,}/g,
  },
  {
    name: "google_oauth_client_secret",
    regex: /GOCSPX-[a-zA-Z0-9_-]+/g,
  },
];

/**
 * Return forbidden pattern hits found in a single text blob (file contents or snippet).
 * @param {string} text
 * @returns {{ name: string, match: string }[]}
 */
function findForbiddenDocSecretPatterns(text) {
  const hits = [];
  const source = String(text || "");

  for (const { name, regex, allow } of DOC_SECRET_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = re.exec(source)) !== null) {
      const fragment = match[0];
      if (typeof allow === "function" && allow(fragment)) {
        continue;
      }
      hits.push({ name, match: fragment });
    }
  }

  return hits;
}

/**
 * Scan every Markdown file under docsDir and aggregate violations.
 * @param {string} docsDir absolute or relative path to docs/
 * @param {{ fs?: typeof import('fs'), path?: typeof import('path') }} [deps] inject for tests
 * @returns {{ file: string, violations: { name: string, match: string }[] }[]}
 */
function scanDocsDirectoryForSecrets(docsDir, deps = {}) {
  const fs = deps.fs || require("fs");
  const path = deps.path || require("path");
  const root = path.resolve(docsDir);
  const results = [];

  if (!fs.existsSync(root)) {
    return results;
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const filePath = path.join(root, entry.name);
    const text = fs.readFileSync(filePath, "utf8");
    const violations = findForbiddenDocSecretPatterns(text);
    if (violations.length > 0) {
      results.push({ file: entry.name, violations });
    }
  }

  return results;
}

module.exports = {
  DOC_SECRET_PATTERNS,
  findForbiddenDocSecretPatterns,
  scanDocsDirectoryForSecrets,
};
