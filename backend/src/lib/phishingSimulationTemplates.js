/**
 * Dev simulation email templates — mirrors ai_service/app/rule_engine.py heuristics.
 *
 * Pattern: single JSON source of truth in shared/ so Node and Go simulators rotate
 * the same scenarios (phishing URL, credential keywords, urgent+link, benign).
 */
const templates = require("../../../shared/phishing_simulation_templates.json");

/** @typedef {{ id: string, label: string, expectedVerdict: string, senderName: string, senderEmailPrefix: string, subject: string, body: string }} SimulationTemplate */

/**
 * Return all templates (read-only copy for UI labels).
 * @returns {SimulationTemplate[]}
 */
function listPhishingSimulationTemplates() {
  return templates.templates.slice();
}

/**
 * Pick one template by round-robin sequence number (1-based).
 * @param {number} seq
 * @returns {SimulationTemplate}
 */
function pickPhishingSimulationTemplate(seq) {
  const list = templates.templates;
  const index = Math.max(0, (Number(seq) - 1) % list.length);
  return list[index];
}

/**
 * Build sender email and externalMessageId for a simulated mailbox message.
 * @param {SimulationTemplate} template
 * @param {number} seq
 * @returns {{ senderEmail: string, externalMessageId: string }}
 */
function simulationCorrelationIds(template, seq) {
  const prefix = template.senderEmailPrefix || "sim";
  return {
    senderEmail: `${prefix}+${seq}@dev.local`,
    externalMessageId: `dev-sim-${template.id}-${seq}`,
  };
}

module.exports = {
  listPhishingSimulationTemplates,
  pickPhishingSimulationTemplate,
  simulationCorrelationIds,
};
