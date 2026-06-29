/**
 * User settings sub-window — theme, profile summary, and session actions.
 *
 * Pattern: ThemeContext persists uiTheme via PUT /auth/preferences (PostgreSQL).
 * Available to every authenticated user (no extra permission required).
 */
import { useAuth } from "../context/AuthContext";
import ThemeSelector from "../components/ThemeSelector";
import HoverHelp from "../components/HoverHelp";

/** Settings panel: appearance + account metadata. */
export default function SettingsView({ onSignOut }) {
  const { user } = useAuth();

  return (
    <main className="layout layout--single">
      <section className="card settings-panel">
        <HoverHelp text="Personal preferences stored in PostgreSQL when signed in; guests use browser localStorage for theme only.">
          <h2>Settings</h2>
        </HoverHelp>

        <div className="settings-panel__section">
          <HoverHelp text="CSS variable themes applied via data-theme on the document root — see ui_guide_color_themes.md.">
            <h3 className="settings-panel__subtitle">Appearance</h3>
          </HoverHelp>
          <ThemeSelector />
        </div>

        <div className="settings-panel__section">
          <h3 className="settings-panel__subtitle">Account</h3>
          <p className="muted settings-panel__meta">
            Signed in as <strong>{user?.email}</strong>
          </p>
          <p className="muted settings-panel__meta">
            Roles: {(user?.roles || []).join(", ") || "none"}
          </p>
          <p className="muted settings-panel__meta">
            Permissions: {(user?.permissions || []).length} granted
          </p>
        </div>

        <div className="settings-panel__section actions">
          <HoverHelp text="Clears JWT from localStorage and returns to the sign-in screen.">
            <button type="button" onClick={onSignOut}>
              Sign out
            </button>
          </HoverHelp>
        </div>
      </section>
    </main>
  );
}
