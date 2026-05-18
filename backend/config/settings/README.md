# `backend/config/settings/` — Django settings by environment

This folder separates Django settings for different deployment slices.

## Files

- `base.py` — shared Django defaults.
- `dev.py` — local development settings.
- `staging.py` — staging settings.
- `prod.py` — production settings.

For the broader project convention, `dev` uses local services/databases, while `staging` and `prod` are expected to use remote managed services.
