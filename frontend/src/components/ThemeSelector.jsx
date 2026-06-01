/**
 * ThemeSelector — dropdown grouped by category (light/dark/bw/colorful).
 */
import { useMemo } from "react";
import { useTheme } from "../context/ThemeContext";

/** Render grouped <select> for CSS-variable themes. */
export default function ThemeSelector() {
  const { themeId, themes, setThemeId, loading } = useTheme();

  const grouped = useMemo(() => {
    const map = new Map();
    for (const t of themes) {
      const list = map.get(t.category) || [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [themes]);

  return (
    <label className="theme-selector">
      <span className="theme-selector-label">Theme</span>
      <select
        value={themeId}
        disabled={loading}
        onChange={(e) => setThemeId(e.target.value)}
        aria-label="Color theme"
      >
        {[...grouped.entries()].map(([category, items]) => (
          <optgroup key={category} label={category}>
            {items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
