import { useCallback, useEffect, useState } from "react";
import {
  readScreenFromLocation,
  writeScreenToLocation,
  SCREEN_FALLBACK_ORDER,
} from "../lib/appScreenNavigation";

/**
 * Keeps the primary TriageApp tab in sync with the URL hash so browser refresh
 * restores the same view (workspace, analytics, graph, logs, settings, admin).
 */
export function useAppScreen(canAccessScreen) {
  const [screen, setScreenState] = useState(() => readScreenFromLocation());

  const setScreen = useCallback((next) => {
    setScreenState(next);
    writeScreenToLocation(next);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setScreenState(readScreenFromLocation());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (canAccessScreen(screen)) {
      return;
    }
    const fallback =
      SCREEN_FALLBACK_ORDER.find(canAccessScreen) || "workspace";
    if (fallback !== screen) {
      setScreen(fallback);
    }
  }, [screen, canAccessScreen, setScreen]);

  return [screen, setScreen];
}
