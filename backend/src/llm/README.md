# `backend/src/llm/` — LLM integration (Node worker path)

This folder contains optional model calls used by the **legacy Node BullMQ worker** when enabled.

## Files

- `analyzeReview.js` — calls a local Ollama HTTP endpoint when `DISABLE_LLM` is not set.
