/**
 * PostgreSQL-backed users, roles, permissions, and password-reset tokens.
 * Shares the statistics database connection (STATISTICS_PG_URL).
 */
const { Pool } = require("pg");
const logger = require("../lib/logger");
const { statsPgUrl } = require("../config/runtime");
const { PERMISSIONS, ROLE_PERMISSIONS } = require("./constants");
const {
  hashPassword,
  verifyPassword,
  hashResetToken,
  generateResetToken,
} = require("./password");

const pool = new Pool({ connectionString: statsPgUrl() });

let ensurePromise;

async function ensureAuthSchema() {
  if (!ensurePromise) {
    // Node API owns auth DDL in Postgres; Django admin reads/writes these tables via triage_auth (unmanaged models).
    ensurePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS auth_roles (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_permissions (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_role_permissions (
        role_id INT NOT NULL REFERENCES auth_roles(id) ON DELETE CASCADE,
        permission_id INT NOT NULL REFERENCES auth_permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      CREATE TABLE IF NOT EXISTS auth_users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS auth_user_roles (
        user_id INT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        role_id INT NOT NULL REFERENCES auth_roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users (lower(email));
      CREATE INDEX IF NOT EXISTS idx_auth_reset_tokens_user ON auth_password_reset_tokens (user_id);
    `);
  }
  return ensurePromise;
}

async function seedRolesAndPermissions() {
  await ensureAuthSchema();
  for (const perm of PERMISSIONS) {
    await pool.query(
      `INSERT INTO auth_permissions (code, description)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
      [perm.code, perm.description]
    );
  }

  for (const [roleName, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleResult = await pool.query(
      `INSERT INTO auth_roles (name, description)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      [roleName, `${roleName} role`]
    );
    const roleId = roleResult.rows[0].id;
    await pool.query("DELETE FROM auth_role_permissions WHERE role_id = $1", [roleId]);
    for (const code of permissionCodes) {
      await pool.query(
        `INSERT INTO auth_role_permissions (role_id, permission_id)
         SELECT $1, p.id FROM auth_permissions p WHERE p.code = $2
         ON CONFLICT DO NOTHING`,
        [roleId, code]
      );
    }
  }
}

async function countUsers() {
  await ensureAuthSchema();
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM auth_users");
  return rows[0].count;
}

async function bootstrapAdminUser() {
  const total = await countUsers();
  if (total > 0) {
    return null;
  }
  const email = String(process.env.AUTH_BOOTSTRAP_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD || "temp-admin-pswd";
  if (!email || email.endsWith("@local.test")) {
    logger.warn("auth", "bootstrap admin skipped — configure a real email first", {
      hint: "bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com",
    });
    return null;
  }
  const user = await createUser({
    email,
    password,
    roleNames: ["admin"],
  });
  logger.warn("auth", "bootstrap admin user created", { email });
  return user;
}

async function loadUserAccess(userId) {
  const { rows: roleRows } = await pool.query(
    `SELECT r.name
     FROM auth_user_roles ur
     JOIN auth_roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
     ORDER BY r.name ASC`,
    [userId]
  );
  const { rows: permRows } = await pool.query(
    `SELECT DISTINCT p.code
     FROM auth_user_roles ur
     JOIN auth_role_permissions rp ON rp.role_id = ur.role_id
     JOIN auth_permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1
     ORDER BY p.code ASC`,
    [userId]
  );
  return {
    roles: roleRows.map((r) => r.name),
    permissions: permRows.map((p) => p.code),
  };
}

async function findUserByEmail(email) {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    `SELECT id, email, password_hash, is_active
     FROM auth_users
     WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] || null;
}

async function findUserById(userId) {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    `SELECT id, email, is_active, created_at, updated_at
     FROM auth_users
     WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function authenticateUser(email, password) {
  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    return null;
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return null;
  }
  const access = await loadUserAccess(user.id);
  return {
    id: user.id,
    email: user.email,
    ...access,
  };
}

async function createUser({ email, password, roleNames }) {
  await ensureAuthSchema();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `INSERT INTO auth_users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, is_active, created_at, updated_at`,
      [normalizedEmail, passwordHash]
    );
    const user = userResult.rows[0];
    for (const roleName of roleNames) {
      await client.query(
        `INSERT INTO auth_user_roles (user_id, role_id)
         SELECT $1, r.id FROM auth_roles r WHERE r.name = $2`,
        [user.id, roleName]
      );
    }
    await client.query("COMMIT");
    const access = await loadUserAccess(user.id);
    return { ...user, ...access };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listUsers() {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.is_active, u.created_at, u.updated_at,
            COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
     FROM auth_users u
     LEFT JOIN auth_user_roles ur ON ur.user_id = u.id
     LEFT JOIN auth_roles r ON r.id = ur.role_id
     GROUP BY u.id
     ORDER BY u.email ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roles: row.roles,
  }));
}

async function setUserActive(userId, isActive) {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    `UPDATE auth_users
     SET is_active = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, email, is_active, created_at, updated_at`,
    [userId, isActive]
  );
  return rows[0] || null;
}

async function setUserRoles(userId, roleNames) {
  await ensureAuthSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM auth_user_roles WHERE user_id = $1", [userId]);
    for (const roleName of roleNames) {
      await client.query(
        `INSERT INTO auth_user_roles (user_id, role_id)
         SELECT $1, r.id FROM auth_roles r WHERE r.name = $2`,
        [userId, roleName]
      );
    }
    await client.query(
      "UPDATE auth_users SET updated_at = now() WHERE id = $1",
      [userId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  const user = await findUserById(userId);
  if (!user) {
    return null;
  }
  const access = await loadUserAccess(userId);
  return { ...user, ...access };
}

async function updateUserPassword(userId, newPassword) {
  await ensureAuthSchema();
  const passwordHash = await hashPassword(newPassword);
  await pool.query(
    `UPDATE auth_users SET password_hash = $2, updated_at = now() WHERE id = $1`,
    [userId, passwordHash]
  );
}

async function createPasswordResetToken(email) {
  await ensureAuthSchema();
  const user = await findUserByEmail(email);
  if (!user || !user.is_active) {
    return null;
  }
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const ttlMinutes = Number(process.env.AUTH_RESET_TOKEN_TTL_MINUTES || 60);
  await pool.query(
    `INSERT INTO auth_password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [user.id, tokenHash, String(ttlMinutes)]
  );
  return { userId: user.id, email: user.email, token };
}

async function resetPasswordWithToken(token, newPassword) {
  await ensureAuthSchema();
  const tokenHash = hashResetToken(token);
  const { rows } = await pool.query(
    `SELECT t.id, t.user_id, t.expires_at, t.used_at
     FROM auth_password_reset_tokens t
     WHERE t.token_hash = $1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
    return false;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE auth_users SET password_hash = $2, updated_at = now() WHERE id = $1`,
      [row.user_id, await hashPassword(newPassword)]
    );
    await client.query(
      `UPDATE auth_password_reset_tokens SET used_at = now() WHERE id = $1`,
      [row.id]
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listRoles() {
  await ensureAuthSchema();
  const { rows } = await pool.query(
    `SELECT r.name,
            COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
     FROM auth_roles r
     LEFT JOIN auth_role_permissions rp ON rp.role_id = r.id
     LEFT JOIN auth_permissions p ON p.id = rp.permission_id
     GROUP BY r.id
     ORDER BY r.name ASC`
  );
  return rows.map((row) => ({ name: row.name, permissions: row.permissions }));
}

module.exports = {
  ensureAuthSchema,
  seedRolesAndPermissions,
  bootstrapAdminUser,
  authenticateUser,
  findUserById,
  loadUserAccess,
  createUser,
  listUsers,
  setUserActive,
  setUserRoles,
  updateUserPassword,
  createPasswordResetToken,
  resetPasswordWithToken,
  listRoles,
};
