# `backend/src/stats/` — PostgreSQL chart statistics

This folder keeps chart/reporting data separate from MongoDB review documents.

## Files

- `statsPg.js` — PostgreSQL schema setup, event writes, chart queries, and dev reset truncation.

MongoDB remains the place to store and fetch review requests. PostgreSQL stores narrow statistics events so graphs do not need to scan large review documents.
