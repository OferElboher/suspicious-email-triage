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
