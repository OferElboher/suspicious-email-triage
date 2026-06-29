/**
 * UI theme catalog — ids must match backend/src/auth/themeConstants.js and themes.css.
 */
export const DEFAULT_THEME = "default-light";

export const LOCAL_THEME_KEY = "triage_ui_theme_guest";

/** Theme picker entries grouped by category in the selector UI. */
export const THEMES = [
  { id: "default-light", label: "Default light", category: "light" },
  { id: "default-dark", label: "Default dark", category: "dark" },
  { id: "ocean-light", label: "Ocean light", category: "light" },
  { id: "ocean-dark", label: "Ocean dark", category: "dark" },
  { id: "forest-light", label: "Forest light", category: "light" },
  { id: "forest-dark", label: "Forest dark", category: "dark" },
  { id: "sunset", label: "Sunset", category: "colorful" },
  { id: "midnight", label: "Midnight", category: "dark" },
  { id: "high-contrast-light", label: "High contrast light", category: "bw" },
  { id: "high-contrast-dark", label: "High contrast dark", category: "bw" },
  { id: "monochrome", label: "Monochrome", category: "bw" },
  { id: "lavender", label: "Lavender", category: "colorful" },
  { id: "coral", label: "Coral", category: "colorful" },
  { id: "solarized-light", label: "Solarized light", category: "light" },
  { id: "solarized-dark", label: "Solarized dark", category: "dark" },
  { id: "nord", label: "Nord", category: "dark" },
  { id: "dracula", label: "Dracula", category: "dark" },
  { id: "spring-blossom", label: "Spring blossom (light blue & green)", category: "colorful" },
];

const THEME_IDS = new Set(THEMES.map((t) => t.id));

/** Return true when theme id exists in the catalog. */
export function isValidTheme(themeId) {
  return THEME_IDS.has(String(themeId || "").trim());
}

/** Apply theme to document root via data-theme attribute (CSS variables pattern). */
export function applyThemeToDocument(themeId) {
  const id = isValidTheme(themeId) ? themeId : DEFAULT_THEME;
  document.documentElement.setAttribute("data-theme", id);
  return id;
}

/**
 * Merge server theme list with bundled catalog so new SPA themes (e.g. spring-blossom)
 * appear even when the API container has not been rebuilt yet.
 * @param {Array<{id:string,label?:string,category?:string}>|undefined} serverThemes
 * @param {Array<{id:string,label:string,category:string}>} [bundledThemes=THEMES]
 * @returns {Array<{id:string,label:string,category:string}>}
 */
export function mergeThemeCatalogs(serverThemes, bundledThemes = THEMES) {
  const byId = new Map(bundledThemes.map((entry) => [entry.id, { ...entry }]));
  (serverThemes || []).forEach((entry) => {
    if (entry?.id && byId.has(entry.id)) {
      byId.set(entry.id, { ...byId.get(entry.id), ...entry });
    }
  });
  return bundledThemes.map((entry) => byId.get(entry.id)).filter(Boolean);
}
