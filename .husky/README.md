# `.husky/` — git hooks

This directory contains shell hooks executed by **Husky** during git operations.

## What runs here

- `pre-commit` — runs `scripts/lint-all.sh` (lint must succeed before a commit is created).
- `pre-push` — runs `scripts/test-all.sh` (tests must succeed before a push proceeds).

## Setup

From the repository root (after `npm install` so `husky` is available):

```bash
# Install Husky/root tooling only if root node_modules is absent.
test -d node_modules || npm install
```

Husky is wired via the root `package.json` `"prepare": "husky"` script.
