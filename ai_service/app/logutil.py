"""Append JSON log lines compatible with Node `lib/logger.js` (merged searchable file)."""

# json serializes log entries as one JSON object per line.
import json

# os reads MERGED_LOG_PATH and creates parent directories.
import os

# datetime/timezone create UTC timestamps for cross-service ordering.
from datetime import datetime, timezone

# _LEVELS is the supported logging vocabulary shared with the Node logger.
_LEVELS = ("info", "warn", "error", "critical")


def _path():
    # MERGED_LOG_PATH lets Docker point all services to one shared log volume.
    return os.environ.get(
        "MERGED_LOG_PATH",
        os.path.join(os.path.dirname(__file__), "..", "logs", "merged.log"),
    )


def log_line(level: str, topic: str, message: str, **meta):
    # Unknown levels are softened to info so logging never crashes task handling.
    if level not in _LEVELS:
        level = "info"
    # entry is the searchable JSON object appended to the merged log file.
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "topic": topic,
        "message": message,
        **meta,
    }
    # path is resolved once per call so env changes in tests are respected.
    path = _path()
    # Ensure the log directory exists before appending.
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # line is newline-delimited JSON for easy grep/stream ingestion.
    line = json.dumps(entry, ensure_ascii=False) + "\n"
    # Append instead of overwrite so all services contribute to one timeline.
    with open(path, "a", encoding="utf-8") as f:
        f.write(line)
    # Also print to stdout so container logs remain useful.
    print(line.strip())
