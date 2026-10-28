/**
 * Connects mongoose to MONGO_URI with timeout and safe URI logging for startup diagnostics.
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
