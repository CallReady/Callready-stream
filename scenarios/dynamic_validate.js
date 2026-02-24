// Validation and normalization for dynamically generated scenarios

const SLOT_ID_PATTERN = /^[a-z0-9_]{2,40}$/;

/**
 * Validate and normalize a raw scenario object from AI generation
 * @param {object} rawScenario - The raw scenario object to validate
 * @returns {object} Normalized and validated scenario object
 * @throws {Error} If validation fails
 */
function validateAndNormalizeScenario(rawScenario) {
  if (!rawScenario || typeof rawScenario !== "object") {
    throw new Error("Scenario must be an object");
  }

  // Required top-level string fields
  const requiredStringFields = ["tag", "displayName", "practiceLabel", "answererRole", "goalStatement"];
  for (const field of requiredStringFields) {
    if (!rawScenario[field] || typeof rawScenario[field] !== "string" || rawScenario[field].trim().length === 0) {
      throw new Error(`Missing or invalid required field: ${field}`);
    }
  }

  // Validate slots array
  if (!Array.isArray(rawScenario.slots)) {
    throw new Error("slots must be an array");
  }
  
  if (rawScenario.slots.length < 3 || rawScenario.slots.length > 10) {
    throw new Error("slots array must contain 3 to 10 items (must have call_purpose, questions, and 1-8 other fields)");
  }

  // Validate slot IDs
  const seenSlotIds = new Set();
  for (const slotId of rawScenario.slots) {
    if (typeof slotId !== "string" || !SLOT_ID_PATTERN.test(slotId)) {
      throw new Error(`Invalid slot ID: ${slotId}. Must match pattern: /^[a-z0-9_]{2,40}$/`);
    }
    if (seenSlotIds.has(slotId)) {
      throw new Error(`Duplicate slot ID: ${slotId}`);
    }
    seenSlotIds.add(slotId);
  }

  // Validate questions object
  if (!rawScenario.questions || typeof rawScenario.questions !== "object") {
    throw new Error("questions must be an object");
  }

  // Ensure every slot has a corresponding question
  for (const slotId of rawScenario.slots) {
    const question = rawScenario.questions[slotId];
    if (!question || typeof question !== "object") {
      throw new Error(`Missing question definition for slot: ${slotId}`);
    }

    // Validate baseQuestion
    if (!question.baseQuestion || typeof question.baseQuestion !== "string") {
      throw new Error(`Missing or invalid baseQuestion for slot: ${slotId}`);
    }

    const baseQ = question.baseQuestion.trim();
    if (baseQ.length < 5 || baseQ.length > 160) {
      throw new Error(`baseQuestion for ${slotId} must be 5-160 characters`);
    }

    // Remove dangerous placeholders
    if (/\{\{|\[generate|<generate/i.test(baseQ)) {
      question.baseQuestion = "Okay, got it.";
    } else {
      question.baseQuestion = baseQ;
    }

    // Validate helpIfStuck if present
    if (question.helpIfStuck !== undefined) {
      if (typeof question.helpIfStuck !== "string") {
        throw new Error(`helpIfStuck for ${slotId} must be a string`);
      }
      const help = question.helpIfStuck.trim();
      if (help.length > 220) {
        throw new Error(`helpIfStuck for ${slotId} must be 0-220 characters`);
      }
      question.helpIfStuck = help;
    }

    // Add default waitForResponse if not present
    if (question.waitForResponse === undefined) {
      question.waitForResponse = true;
    }
  }

  // Ensure the first slot is "call_purpose" with a proper greeting
  const firstSlotId = rawScenario.slots[0];
  if (firstSlotId !== "call_purpose") {
    throw new Error("First slot must be 'call_purpose' for the opening greeting");
  }
  
  const callPurposeField = rawScenario.questions["call_purpose"];
  if (!callPurposeField) {
    throw new Error("Missing 'call_purpose' field definition");
  }
  
  // Validate that call_purpose has a greeting-style baseQuestion
  const greeting = callPurposeField.baseQuestion;
  if (!greeting || greeting.length < 20) {
    throw new Error("call_purpose baseQuestion must be a proper greeting (at least 20 characters)");
  }

  // Ensure the last slot is "questions" with loopUntilDone
  const lastSlotId = rawScenario.slots[rawScenario.slots.length - 1];
  if (lastSlotId !== "questions") {
    throw new Error("Last slot must be 'questions' for asking if caller has any questions");
  }
  
  const questionsField = rawScenario.questions["questions"];
  if (!questionsField) {
    throw new Error("Missing 'questions' field definition");
  }
  
  // Ensure loopUntilDone is set for questions field
  if (!questionsField.loopUntilDone) {
    questionsField.loopUntilDone = true;
  }

  // Validate pricing if present
  if (rawScenario.pricing !== undefined) {
    if (typeof rawScenario.pricing !== "object" || rawScenario.pricing === null) {
      throw new Error("pricing must be an object if provided");
    }
    
    // Recursively validate that all values are numbers or nested objects of numbers
    function validatePricing(obj, path = "pricing") {
      for (const key in obj) {
        const val = obj[key];
        if (typeof val === "number") {
          continue;
        } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
          validatePricing(val, `${path}.${key}`);
        } else {
          throw new Error(`Invalid pricing value at ${path}.${key}: must be number or nested object`);
        }
      }
    }
    validatePricing(rawScenario.pricing);
  }

  // Build normalized scenario with only allowed fields
  const normalized = {
    tag: rawScenario.tag.trim(),
    displayName: rawScenario.displayName.trim(),
    practiceLabel: rawScenario.practiceLabel.trim(),
    answererRole: rawScenario.answererRole.trim(),
    goalStatement: rawScenario.goalStatement.trim(),
    validation: { mode: "trust_ai" },
    slots: rawScenario.slots,
    questions: rawScenario.questions,
    completion: { mode: "all_required_slots_complete" }
  };

  // closingMessage is REQUIRED for dynamic scenarios
  if (!rawScenario.closingMessage || typeof rawScenario.closingMessage !== "string" || rawScenario.closingMessage.trim().length === 0) {
    throw new Error("closingMessage is required and must be a non-empty string");
  }
  normalized.closingMessage = rawScenario.closingMessage.trim();

  // Add pricing if present
  if (rawScenario.pricing) {
    normalized.pricing = rawScenario.pricing;
  }

  return normalized;
}

module.exports = {
  validateAndNormalizeScenario
};
