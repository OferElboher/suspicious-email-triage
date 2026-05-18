const mongoose = require("mongoose");
const logger = require("./logger");
const { mongoUri } = require("../config/runtime");

async function connectMongo() {
  const uri = mongoUri();
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  logger.info("mongo", "connected", { uri: uri.replace(/\/\/.*@/, "//***@") });
}

module.exports = { connectMongo };
