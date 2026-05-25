const jwt = require("jsonwebtoken");

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required for authentication");
  }
  return secret;
}

function jwtTtlSeconds() {
  const hours = Number(process.env.JWT_TTL_HOURS || 12);
  return Math.max(1, hours) * 3600;
}

function signAccessToken(payload) {
  return jwt.sign(payload, jwtSecret(), { expiresIn: jwtTtlSeconds() });
}

function verifyAccessToken(token) {
  return jwt.verify(token, jwtSecret());
}

module.exports = { signAccessToken, verifyAccessToken, jwtTtlSeconds };
