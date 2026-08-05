/** Mongoose model: email payload, async status, hybrid analysis, analyst override. */
const mongoose = require("mongoose");

const FindingSchema = new mongoose.Schema(
  {
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      required: true,
    },
    explanation: { type: String, required: true },
    evidence: { type: String, required: false },
  },
  { _id: false }
);

const ReferenceSourceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["text", "url"], required: true },
    title: String,
    content: String,
  },
  { _id: false }
);

const ReviewSchema = new mongoose.Schema(
  {
    senderName: { type: String, required: true },
    senderEmail: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    links: { type: [String], default: [] },
    referenceSources: { type: [ReferenceSourceSchema], default: [] },
    /** source: distinguishes manual UI, dev simulator, and Go mailbox ingest paths. */
    source: {
      type: String,
      enum: ["user", "dev_simulation", "mailbox_ingest", "mailbox_simulation"],
      default: "user",
      index: true,
    },
    /** externalMessageId: mail platform correlation id (Graph message id, Postfix queue id, etc.). */
    externalMessageId: { type: String, index: true, sparse: true },
    /** callbackUrl: optional per-message webhook override; lowest priority after ingestClientId registry lookup. */
    callbackUrl: { type: String },
    /** ingestClientId: registered mail platform slug — resolves default callback_url from Postgres ingest_clients. */
    ingestClientId: { type: String, index: true, sparse: true },
    /** verdictDelivery: audit trail for outbound verdict webhook POST attempts. */
    verdictDelivery: {
      status: {
        type: String,
        enum: ["delivered", "failed", "skipped"],
      },
      reason: { type: String },
      attempts: { type: Number },
      lastError: { type: String },
      deliveredAt: { type: Date },
      lastHttpStatus: { type: Number },
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    analysisResult: {
      verdict: {
        type: String,
        enum: ["benign", "suspicious", "likely_phishing"],
      },
      recommendedAction: {
        type: String,
        enum: ["close", "investigate", "report_and_block"],
      },
      summary: String,
      findings: { type: [FindingSchema], default: [] },
      followUpQuestions: { type: [String], default: [] },
    },
    override: {
      verdict: {
        type: String,
        enum: ["benign", "suspicious", "likely_phishing"],
      },
      recommendedAction: {
        type: String,
        enum: ["close", "investigate", "report_and_block"],
      },
      reason: String,
      timestamp: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", ReviewSchema);
