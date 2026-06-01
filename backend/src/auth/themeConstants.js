/**
 * Allowed UI theme ids — must match [data-theme="..."] blocks in themes.css.
 */
const DEFAULT_UI_THEME = "default-light";

/** Catalog exposed to the SPA theme picker (id + human label + category). */
const UI_THEMES = [
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
];

const THEME_IDS = new Set(UI_THEMES.map((t) => t.id));

/** Return true when theme id is in the catalog. */
function isValidUiTheme(themeId) {
  return THEME_IDS.has(String(themeId || "").trim());
}

module.exports = { DEFAULT_UI_THEME, UI_THEMES, THEME_IDS, isValidUiTheme };
