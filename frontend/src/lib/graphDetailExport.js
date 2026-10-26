/**
 * Clipboard and download helpers for pinned graph node/edge detail text.
 * Pattern: plain string export for SOC tickets (no server round-trip).
 */

/** Copy multi-line graph detail to the system clipboard. */
export async function copyGraphDetailText(text) {
  if (!text) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* Clipboard may be blocked on non-HTTPS dev hosts; caller can still offer download. */
  }
}

/** Trigger a browser download of graph detail as a .txt file. */
export function saveGraphDetailText(text) {
  if (!text) {
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `graph-detail-${Date.now()}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
