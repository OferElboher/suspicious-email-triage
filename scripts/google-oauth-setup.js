#!/usr/bin/env node
/**
 * One-time Google OAuth setup for dev: email (Gmail send) or login (Sign in with Google).
 *
 * Usage:
 *   node scripts/google-oauth-setup.js email CLIENT_ID CLIENT_SECRET SENDER_EMAIL
 *   node scripts/google-oauth-setup.js login CLIENT_ID CLIENT_SECRET
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const LOCAL_ENV = path.join(ROOT, "backend/.env");
const DEV_ENV = path.join(ROOT, "backend/.env.dev");
const REDIRECT_PORT = Number(process.env.GOOGLE_OAUTH_SETUP_PORT || 3333);

const SCOPES = {
  email: "https://www.googleapis.com/auth/gmail.send",
  login: "openid email profile",
};

/** Upsert a key=value line in backend/.env (gitignored secrets file). */
function upsertVar(file, key, value) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : `${text.trim()}\n${line}\n`;
  fs.writeFileSync(file, text, "utf8");
}

/** Ensure backend/.env exists (seed from .env.dev on first run). */
function ensureEnvFile() {
  if (!fs.existsSync(LOCAL_ENV)) {
    fs.copyFileSync(DEV_ENV, LOCAL_ENV);
    console.log("Created backend/.env from backend/.env.dev");
  }
}

/** Exchange authorization code for refresh_token (may be omitted on re-consent). */
async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  return res.json();
}

/** Start local redirect listener and open Google consent in the user's browser. */
async function runOAuthFlow({ mode, clientId, clientSecret, senderEmail }) {
  const redirectUri = `http://localhost:${REDIRECT_PORT}/oauth/callback`;
  const scope = SCOPES[mode];
  const state = `triage-${mode}-${Date.now()}`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  console.log("\nOpen this URL in your browser (Sign in with Google):\n");
  console.log(authUrl.toString());
  console.log("\nWaiting for redirect on", redirectUri, "...\n");

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        if (url.pathname !== "/oauth/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400);
          res.end("Invalid state");
          reject(new Error("OAuth state mismatch"));
          server.close();
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400);
          res.end("Missing code");
          reject(new Error(url.searchParams.get("error") || "Missing authorization code"));
          server.close();
          return;
        }
        const tokens = await exchangeCode({ code, clientId, clientSecret, redirectUri });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Success</h1><p>You can close this tab and return to the terminal.</p>");
        server.close();
        resolve(tokens);
      } catch (err) {
        reject(err);
        server.close();
      }
    });
    server.listen(REDIRECT_PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Listening on port ${REDIRECT_PORT} for OAuth callback...`);
    });
  });
}

async function main() {
  const mode = process.argv[2];
  const clientId = process.argv[3];
  const clientSecret = process.argv[4];
  const senderEmail = process.argv[5];

  if (!mode || !clientId || !clientSecret || !SCOPES[mode]) {
    console.error("Usage:");
    console.error("  node scripts/google-oauth-setup.js email CLIENT_ID CLIENT_SECRET SENDER_EMAIL");
    console.error("  node scripts/google-oauth-setup.js login CLIENT_ID CLIENT_SECRET");
    process.exit(1);
  }
  if (mode === "email" && !senderEmail) {
    console.error("email mode requires SENDER_EMAIL (your Gmail address).");
    process.exit(1);
  }

  ensureEnvFile();
  upsertVar(LOCAL_ENV, "GOOGLE_OAUTH_CLIENT_ID", clientId);
  upsertVar(LOCAL_ENV, "GOOGLE_OAUTH_CLIENT_SECRET", clientSecret);

  const tokens = await runOAuthFlow({ mode, clientId, clientSecret, senderEmail });

  if (mode === "email") {
    if (!tokens.refresh_token) {
      console.warn("No refresh_token returned — revoke prior access at https://myaccount.google.com/permissions and retry with prompt=consent.");
    } else {
      upsertVar(LOCAL_ENV, "GOOGLE_OAUTH_REFRESH_TOKEN", tokens.refresh_token);
    }
    upsertVar(LOCAL_ENV, "GOOGLE_OAUTH_SENDER_EMAIL", senderEmail);
    upsertVar(LOCAL_ENV, "EMAIL_DELIVERY", "google_oauth");
    upsertVar(LOCAL_ENV, "SMTP_DELIVERY", "google_oauth");
    console.log("\nConfigured EMAIL_DELIVERY=google_oauth in backend/.env");
    console.log("Recreate backend: DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend");
  } else {
    upsertVar(LOCAL_ENV, "GOOGLE_LOGIN_ENABLED", "true");
    upsertVar(LOCAL_ENV, "GOOGLE_LOGIN_REDIRECT_URI", "http://localhost:3000/auth/google/callback");
    console.log("\nConfigured GOOGLE_LOGIN_ENABLED=true in backend/.env");
    console.log("Recreate backend, then open http://localhost:3000/auth/google/start or use the UI button.");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
