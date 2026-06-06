import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getJson, postJson } from "../api/client";
import { resolveOAuthApiBase } from "../lib/apiBase";
import PasswordInput from "../components/PasswordInput";

/** Sign-in form — posts credentials to POST /auth/login via CRA dev proxy. */
export default function LoginView({ onForgotPassword }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [help, setHelp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false);
  const [loginConfig, setLoginConfig] = useState({
    devLoginAssist: false,
    bootstrapEmailConfigured: false,
    maskedBootstrapEmail: null,
    bootstrapPasswordHint: null,
  });

  useEffect(() => {
    getJson("/auth/config", { auth: false })
      .then((cfg) => {
        setGoogleLoginEnabled(Boolean(cfg.googleLoginEnabled));
        setLoginConfig({
          devLoginAssist: Boolean(cfg.devLoginAssist),
          bootstrapEmailConfigured: Boolean(cfg.bootstrapEmailConfigured),
          maskedBootstrapEmail: cfg.maskedBootstrapEmail || null,
          bootstrapPasswordHint: cfg.bootstrapPasswordHint || null,
        });
      })
      .catch(() => setGoogleLoginEnabled(false));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setHelp("");
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      if (err.networkError) {
        setError("Cannot reach the API.");
        setHelp(
          "Start Docker backend (port 3000) and the React dev server (port 3001). " +
            "See docs/stack_guide_build_and_run.md."
        );
      } else if (err.body?.error === "invalid_credentials") {
        setError("Email or password did not match.");
        setHelp(
          loginConfig.bootstrapEmailConfigured
            ? `Use bootstrap email ${loginConfig.maskedBootstrapEmail} and the dev password from backend/.env.dev (default temp-admin-pswd).`
            : "Configure bootstrap email first: bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com"
        );
      } else {
        setError(err.message || "Sign in failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** Dev-only: sync bootstrap admin password with AUTH_BOOTSTRAP_* in the running backend container. */
  const runDevBootstrapReset = async () => {
    setResetting(true);
    setError("");
    setHelp("");
    try {
      const data = await postJson("/auth/dev/bootstrap-reset", {}, { auth: false });
      setHelp(
        `Bootstrap admin ${data.action === "created" ? "created" : "password reset"} for ${data.email}. ` +
          `Try signing in with password: ${data.passwordHint || loginConfig.bootstrapPasswordHint || "temp-admin-pswd"}.`
      );
      if (data.email) {
        setEmail(data.email);
      }
    } catch (err) {
      if (err.body?.error === "bootstrap_email_not_configured") {
        setError("Bootstrap email is not configured in the backend container.");
        setHelp("Run: bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com");
      } else if (err.body?.error === "dev_only") {
        setError("Bootstrap reset is available only in DEPLOYMENT_ENV=dev.");
      } else {
        setError(err.networkError ? err.message : err.message || "Bootstrap reset failed.");
      }
    } finally {
      setResetting(false);
    }
  };

  const oauthBase = resolveOAuthApiBase();

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="auth-lead">
          Authentication is required for the triage workspace. In local dev, the API runs in Docker on
          port <strong>3000</strong>; this UI uses a proxy on port <strong>3001</strong>.
        </p>
        {loginConfig.devLoginAssist && loginConfig.bootstrapEmailConfigured && (
          <p className="auth-hint-box">
            <strong>Dev bootstrap account:</strong> email like{" "}
            <code>{loginConfig.maskedBootstrapEmail}</code>, password{" "}
            <code>{loginConfig.bootstrapPasswordHint || "temp-admin-pswd"}</code> (from{" "}
            <code>backend/.env.dev</code>).
          </p>
        )}
        <label className="field">
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <PasswordInput
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && <p className="status-failed">{error}</p>}
        {help && <p className="auth-help-box">{help}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          {loginConfig.devLoginAssist && (
            <button
              type="button"
              className="button"
              disabled={resetting}
              onClick={() => runDevBootstrapReset().catch(() => {})}
            >
              {resetting ? "Resetting…" : "Reset dev bootstrap password"}
            </button>
          )}
          {googleLoginEnabled && (
            <a className="button" href={`${oauthBase}/auth/google/start`}>
              Sign in with Google
            </a>
          )}
          <button type="button" onClick={onForgotPassword}>
            Forgot password
          </button>
        </div>
        {loginConfig.devLoginAssist && (
          <p className="muted auth-footnote">
            After <code>docker compose build</code>, Postgres may keep old users while passwords drift.
            Use <strong>Reset dev bootstrap password</strong> or{" "}
            <code>bash scripts/bootstrap-auth-admin.sh --reset-password</code>. Guide:{" "}
            <code>docs/stack_guide_build_and_run.md</code>.
          </p>
        )}
      </form>
    </div>
  );
}

/** Forgot-password form — always returns 200 from API (no email enumeration). */
export function ForgotPasswordView({ onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const data = await postJson("/auth/forgot-password", { email: email.trim() }, { auth: false });
      setMessage(data.message || "If the account exists, reset instructions were sent.");
    } catch (err) {
      setError(err.networkError ? err.message : err.message || "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Recover credentials</h1>
        <p className="auth-lead">
          Enter your account email. Dev stack sends reset mail to Mailpit — open{" "}
          <a href="http://localhost:8025" target="_blank" rel="noreferrer">
            localhost:8025
          </a>
          .
        </p>
        <label className="field">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        {message && <p className="status-completed">{message}</p>}
        {error && <p className="status-failed">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
          <button type="button" onClick={onBackToLogin}>
            Back to sign in
          </button>
        </div>
      </form>
    </div>
  );
}

/** Reset-password form — consumes one-time token from email link query string. */
export function ResetPasswordView({ token, onComplete }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const data = await postJson("/auth/reset-password", { token, password }, { auth: false });
      setMessage(data.message || "Password updated.");
      onComplete();
    } catch (err) {
      if (err.networkError) {
        setError(err.message);
      } else if (err.body?.error === "invalid_or_expired_token") {
        setError("Invalid or expired reset link.");
      } else {
        setError(err.message || "Update failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Set new password</h1>
        <PasswordInput
          label="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <PasswordInput
          label="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        {message && <p className="status-completed">{message}</p>}
        {error && <p className="status-failed">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={submitting || !token}>
            {submitting ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>
    </div>
  );
}
