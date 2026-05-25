const { verifyAccessToken } = require("../../auth/jwt");
const { findUserById, loadUserAccess } = require("../../auth/authPg");

function parseBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}

async function authenticate(req, res, next) {
  try {
    const token = parseBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: "authentication_required" });
    }
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (_err) {
      return res.status(401).json({ error: "invalid_token" });
    }
    const user = await findUserById(payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "invalid_token" });
    }
    const access = await loadUserAccess(user.id);
    req.auth = {
      userId: user.id,
      email: user.email,
      roles: access.roles,
      permissions: access.permissions,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

function requirePermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: "authentication_required" });
    }
    const granted = new Set(req.auth.permissions || []);
    const allowed = requiredPermissions.some((perm) => granted.has(perm));
    if (!allowed) {
      return res.status(403).json({ error: "forbidden", missing: requiredPermissions });
    }
    return next();
  };
}

function requireRole(...requiredRoles) {
  return (req, res, next) => {
    if (!req.auth) {
      return res.status(401).json({ error: "authentication_required" });
    }
    const granted = new Set(req.auth.roles || []);
    const allowed = requiredRoles.some((role) => granted.has(role));
    if (!allowed) {
      return res.status(403).json({ error: "forbidden", missingRoles: requiredRoles });
    }
    return next();
  };
}

function hasPermission(auth, permission) {
  return Boolean(auth?.permissions?.includes(permission));
}

function hasRole(auth, role) {
  return Boolean(auth?.roles?.includes(role));
}

module.exports = {
  authenticate,
  requirePermission,
  requireRole,
  hasPermission,
  hasRole,
};
