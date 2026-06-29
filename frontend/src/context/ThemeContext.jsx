/**
 * ThemeContext — persists UI theme per authenticated user (PostgreSQL via PUT /auth/preferences).
 * Guests use localStorage until login; logged-in users sync from /auth/me and server-side storage.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getJson, putJson } from "../api/client";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_THEME,
  LOCAL_THEME_KEY,
  THEMES,
  applyThemeToDocument,
  mergeThemeCatalogs,
  isValidTheme,
} from "../themes/themes";

const ThemeContext = createContext(null);

/** Provider wraps the app shell and exposes theme state + setter. */
export function ThemeProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [themeId, setThemeIdState] = useState(() => {
    const guest = localStorage.getItem(LOCAL_THEME_KEY);
    return isValidTheme(guest) ? guest : DEFAULT_THEME;
  });
  const [catalog, setCatalog] = useState(THEMES);
  const [loading, setLoading] = useState(false);

  /** Push theme id to DOM so CSS variable blocks in themes.css take effect. */
  useEffect(() => {
    applyThemeToDocument(themeId);
  }, [themeId]);

  /** When user logs in, prefer server-stored uiTheme over guest localStorage. */
  useEffect(() => {
    if (user?.uiTheme && isValidTheme(user.uiTheme)) {
      setThemeIdState(user.uiTheme);
    }
  }, [user?.uiTheme]);

  /** Load theme catalog from API when authenticated; merge with bundled list so new SPA themes are never dropped. */
  useEffect(() => {
    if (!isAuthenticated) return;
    getJson("/auth/preferences")
      .then((data) => {
        if (Array.isArray(data.themes) && data.themes.length) {
          setCatalog(mergeThemeCatalogs(data.themes, THEMES));
        }
        if (data.uiTheme && isValidTheme(data.uiTheme)) {
          setThemeIdState(data.uiTheme);
        }
      })
      .catch(() => {
        /* Preferences are optional — fall back to bundled catalog. */
      });
  }, [isAuthenticated]);

  /** Change theme: update DOM immediately, persist guest localStorage or server PUT. */
  const setThemeId = useCallback(
    async (nextTheme) => {
      if (!isValidTheme(nextTheme)) return;
      setThemeIdState(nextTheme);
      applyThemeToDocument(nextTheme);

      if (isAuthenticated) {
        setLoading(true);
        try {
          await putJson("/auth/preferences", { uiTheme: nextTheme });
        } catch (_err) {
          /* UI already updated; user can retry from selector. */
        } finally {
          setLoading(false);
        }
      } else {
        localStorage.setItem(LOCAL_THEME_KEY, nextTheme);
      }
    },
    [isAuthenticated]
  );

  const value = useMemo(
    () => ({
      themeId,
      themes: catalog,
      setThemeId,
      loading,
    }),
    [themeId, catalog, setThemeId, loading]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Hook for theme selector and other consumers. */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
