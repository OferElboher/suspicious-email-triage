import { useEffect, useMemo, useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import TriageApp from "./TriageApp";
import LoginView, { ForgotPasswordView, ResetPasswordView } from "./views/AuthViews";
import "./styles/triage.css";

function readResetToken() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

function AuthenticatedShell() {
  const { loading, isAuthenticated } = useAuth();
  const [authScreen, setAuthScreen] = useState("login");
  const resetToken = useMemo(() => readResetToken(), []);

  useEffect(() => {
    if (resetToken) {
      setAuthScreen("reset");
    }
  }, [resetToken]);

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="card auth-card">
          <p className="muted">Checking session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authScreen === "forgot") {
      return <ForgotPasswordView onBackToLogin={() => setAuthScreen("login")} />;
    }
    if (authScreen === "reset") {
      return (
        <ResetPasswordView
          token={resetToken}
          onComplete={() => {
            window.history.replaceState({}, "", window.location.pathname);
            setAuthScreen("login");
          }}
        />
      );
    }
    return <LoginView onForgotPassword={() => setAuthScreen("forgot")} />;
  }

  return <TriageApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedShell />
    </AuthProvider>
  );
}
