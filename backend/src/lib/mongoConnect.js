/**
 * This helper connects Mongoose to MONGO_URI from runtime configuration with sane timeouts.
 *
 * server.js awaits it before accepting HTTP traffic so routes do not race against a disconnected database.
 *
 * Logs redact credentials in connection strings for safer operator copy-paste.
 *
 * Disconnect handling relies on container restart policies in Compose.
 */
const mongoose = require("mongoose");
const logger = require("./logger");
const { mongoUri } = require("../config/runtime");

async function connectMongo() {
  const uri = mongoUri();
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info("mongo", "connected", { uri: uri.replace(/\/\/.*@/, "//***@") });
}

module.exports = { connectMongo };
