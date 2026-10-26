/**
 * Clipboard and file export for graph node/edge detail text (same string as hover tooltip).
 * Pattern: browser Clipboard API + File System Access API with download fallback.
 */

/** Copy multi-line graph detail to the system clipboard. */
export async function copyGraphDetailText(text) {
  if (!text) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* Clipboard may be blocked on non-HTTPS dev hosts; save-to-file still works. */
  }
}

/** Fallback download when showSaveFilePicker is unavailable (older browsers, HTTP localhost). */
export function saveGraphDetailText(text, suggestedName) {
  if (!text) {
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName || `graph-detail-${Date.now()}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Save detail text; uses native "Save as" dialog when the File System Access API exists.
 * @param {string} text — full tooltip body (describeNode / describeEdge output)
 */
export async function saveGraphDetailTextWithPicker(text) {
  if (!text) {
    return;
  }
  const suggestedName = `graph-detail-${Date.now()}.txt`;
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "Plain text",
            accept: { "text/plain": [".txt"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (err) {
      if (err?.name === "AbortError") {
        return;
      }
    }
  }
  saveGraphDetailText(text, suggestedName);
}
