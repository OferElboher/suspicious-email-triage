import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { postJson } from "../api/client";

export default function LoginView({ onForgotPassword }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err.body?.error === "invalid_credentials" ? "Invalid email or password." : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Sign in</h1>
        <p className="muted">Authentication is required for the triage workspace and API.</p>
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
        <label className="field">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="status-failed">{error}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" onClick={onForgotPassword}>
            Forgot password
          </button>
        </div>
      </form>
    </div>
  );
}

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
      setError(err.message || "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Recover credentials</h1>
        <p className="muted">
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
      setError(err.body?.error === "invalid_or_expired_token" ? "Invalid or expired reset link." : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Set new password</h1>
        <label className="field">
          New password
          <input
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label className="field">
          Confirm password
          <input
            type="password"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
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
