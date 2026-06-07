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
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false);
  const [devLoginAssist, setDevLoginAssist] = useState(false);

  useEffect(() => {
    getJson("/auth/config", { auth: false })
      .then((cfg) => {
        setGoogleLoginEnabled(Boolean(cfg.googleLoginEnabled));
        setDevLoginAssist(Boolean(cfg.devLoginAssist));
      })
      .catch(() => setGoogleLoginEnabled(false));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      if (err.networkError) {
        setError("Cannot reach the server. Check that the API and UI are running.");
      } else if (err.body?.error === "invalid_credentials") {
        setError("Incorrect email or password.");
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
    setNotice("");
    try {
      const data = await postJson("/auth/dev/bootstrap-reset", {}, { auth: false });
      if (data.email) {
        setEmail(data.email);
      }
      setNotice("Dev password reset. Sign in with your bootstrap email and temp-admin-pswd.");
    } catch (err) {
      if (err.body?.error === "bootstrap_email_not_configured") {
        setError("Bootstrap email is not configured on the server.");
      } else if (err.body?.error === "dev_only") {
        setError("This action is available in dev only.");
      } else {
        setError(err.networkError ? err.message : err.message || "Password reset failed.");
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
        {notice && <p className="auth-notice">{notice}</p>}
        <div className="actions auth-actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          {devLoginAssist && (
            <button
              type="button"
              className="button"
              disabled={resetting}
              onClick={() => runDevBootstrapReset().catch(() => {})}
            >
              {resetting ? "Resetting…" : "Reset dev password"}
            </button>
          )}
          {googleLoginEnabled && (
            <a className="button" href={`${oauthBase}/auth/google/start`}>
              Sign in with Google
            </a>
          )}
          <button type="button" className="link-button" onClick={onForgotPassword}>
            Forgot password
          </button>
        </div>
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
        <h1>Forgot password</h1>
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
        <div className="actions auth-actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Sending…" : "Send reset link"}
          </button>
          <button type="button" className="link-button" onClick={onBackToLogin}>
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
        <div className="actions auth-actions">
          <button type="submit" className="primary" disabled={submitting || !token}>
            {submitting ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>
    </div>
  );
}
