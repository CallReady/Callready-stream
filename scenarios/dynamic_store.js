// In-memory storage for dynamically generated scenarios
// Keyed by CallSid to isolate per-call

const dynamicScenarios = new Map();

/**
 * Store a dynamic scenario for a given CallSid
 * @param {string} callSid - The Twilio CallSid
 * @param {object} scenarioObj - The validated scenario configuration object
 */
function setDynamicScenario(callSid, scenarioObj) {
  if (!callSid || typeof callSid !== "string") {
    throw new Error("CallSid must be a non-empty string");
  }
  if (!scenarioObj || typeof scenarioObj !== "object") {
    throw new Error("scenarioObj must be an object");
  }

  dynamicScenarios.set(callSid, {
    scenario: scenarioObj,
    createdAt: Date.now()
  });
}

/**
 * Retrieve a dynamic scenario for a given CallSid
 * @param {string} callSid - The Twilio CallSid
 * @returns {object|null} The scenario object, or null if not found
 */
function getDynamicScenario(callSid) {
  if (!callSid) return null;
  
  const entry = dynamicScenarios.get(callSid);
  return entry ? entry.scenario : null;
}

/**
 * Remove a dynamic scenario from storage
 * @param {string} callSid - The Twilio CallSid
 */
function clearDynamicScenario(callSid) {
  if (callSid) {
    dynamicScenarios.delete(callSid);
  }
}

/**
 * Get count of stored scenarios (for monitoring)
 * @returns {number}
 */
function getDynamicScenarioCount() {
  return dynamicScenarios.size;
}

module.exports = {
  setDynamicScenario,
  getDynamicScenario,
  clearDynamicScenario,
  getDynamicScenarioCount
};
