const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  hashResetToken,
  generateResetToken,
};
