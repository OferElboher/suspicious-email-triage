# `backend/src/auth/` — PostgreSQL users, roles, and JWT authentication

- `authPg.js` — schema, seed roles/permissions, user CRUD, password reset tokens.
- `constants.js` — permission codes and default role mappings.
- `password.js` — bcrypt hashing and reset-token helpers.
- `jwt.js` — access token sign/verify.
- `email.js` — optional SMTP password recovery.

See `docs/AUTHENTICATION_AND_RBAC.md` for login, recovery, and API examples.
