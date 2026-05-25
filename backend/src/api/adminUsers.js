const express = require("express");
const logger = require("../lib/logger");
const { ROLE_NAMES } = require("../auth/constants");
const {
  createUser,
  listUsers,
  setUserActive,
  setUserRoles,
  listRoles,
} = require("../auth/authPg");
const { requirePermission } = require("../http/middleware/auth");

const router = express.Router();

router.get("/roles", requirePermission("admin.users"), async (_req, res) => {
  try {
    const roles = await listRoles();
    res.json({ roles, assignableRoleNames: ROLE_NAMES });
  } catch (err) {
    logger.error("admin", "list roles failed", { error: err.message });
    res.status(500).json({ error: "roles_list_failed" });
  }
});

router.get("/", requirePermission("admin.users"), async (_req, res) => {
  try {
    const users = await listUsers();
    res.json({ users });
  } catch (err) {
    logger.error("admin", "list users failed", { error: err.message });
    res.status(500).json({ error: "users_list_failed" });
  }
});

router.post("/", requirePermission("admin.users"), async (req, res) => {
  try {
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");
    const roleNames = Array.isArray(req.body.roles) ? req.body.roles : ["viewer"];
    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "password_too_short" });
    }
    const invalidRoles = roleNames.filter((r) => !ROLE_NAMES.includes(r));
    if (invalidRoles.length) {
      return res.status(400).json({ error: "invalid_roles", roles: invalidRoles });
    }
    const user = await createUser({ email, password, roleNames });
    logger.info("admin", "user provisioned", { email: user.email, roles: roleNames });
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "email_already_exists" });
    }
    logger.error("admin", "create user failed", { error: err.message });
    res.status(500).json({ error: "user_create_failed" });
  }
});

router.patch("/:id", requirePermission("admin.users"), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "invalid_user_id" });
    }
    if (typeof req.body.isActive === "boolean") {
      await setUserActive(userId, req.body.isActive);
    }
    let user = null;
    if (Array.isArray(req.body.roles)) {
      const invalidRoles = req.body.roles.filter((r) => !ROLE_NAMES.includes(r));
      if (invalidRoles.length) {
        return res.status(400).json({ error: "invalid_roles", roles: invalidRoles });
      }
      await setUserRoles(userId, req.body.roles);
    }
    const users = await listUsers();
    user = users.find((u) => u.id === userId) || null;
    if (!user) {
      return res.status(404).json({ error: "user_not_found" });
    }
    res.json({ user });
  } catch (err) {
    logger.error("admin", "update user failed", { error: err.message });
    res.status(500).json({ error: "user_update_failed" });
  }
});

module.exports = router;
