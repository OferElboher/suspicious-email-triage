import { useEffect, useMemo, useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import TriageApp from "./TriageApp";
import LoginView, { ForgotPasswordView, ResetPasswordView } from "./views/AuthViews";
import ThemeSelector from "./components/ThemeSelector";
import "./styles/triage.css";
import "./styles/themes.css";

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
      return (
        <>
          <div className="auth-theme-bar">
            <ThemeSelector />
          </div>
          <ForgotPasswordView onBackToLogin={() => setAuthScreen("login")} />
        </>
      );
    }
    if (authScreen === "reset") {
      return (
        <>
          <div className="auth-theme-bar">
            <ThemeSelector />
          </div>
          <ResetPasswordView
            token={resetToken}
            onComplete={() => {
              window.history.replaceState({}, "", window.location.pathname);
              setAuthScreen("login");
            }}
          />
        </>
      );
    }
    return (
      <>
        <div className="auth-theme-bar">
          <ThemeSelector />
        </div>
        <LoginView onForgotPassword={() => setAuthScreen("forgot")} />
      </>
    );
  }

  return <TriageApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AuthenticatedShell />
      </ThemeProvider>
    </AuthProvider>
  );
}
