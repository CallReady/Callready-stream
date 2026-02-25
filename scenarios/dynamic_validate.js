// Validation and normalization for dynamically generated scenarios

const SLOT_ID_PATTERN = /^[a-z0-9_]{2,40}$/;

/**
 * Library of default slotSpec templates for common slot types
 * These are also defined in server.js, but duplicated here for dynamic generation independence
 */
const SLOTSPEC_TEMPLATES = {
  patient_name: {
    promptIntent: "Collect the patient's full name",
    requirement: "patient's full name (at least 2 words)",
    repromptHelp: "Please tell me your first and last name.",
    validatorHint: { type: "min_words", minWords: 2 },
    type: "name",
    examplesGood: ["John Smith", "Maria Garcia", "David Johnson"],
    followups: []
  },
  member_name: {
    promptIntent: "Collect the member's full name",
    requirement: "member's full name (at least 2 words)",
    repromptHelp: "Please tell me your first and last name.",
    validatorHint: { type: "min_words", minWords: 2 },
    type: "name",
    examplesGood: ["John Smith", "Maria Garcia", "David Johnson"],
    followups: []
  },
  phone_number: {
    promptIntent: "Collect a valid phone number",
    requirement: "a valid phone number (10+ digits or international format)",
    repromptHelp: "Please provide your phone number.",
    validatorHint: { type: "phone" },
    type: "phone",
    examplesGood: ["503-555-0123", "5035550123", "+1 503 555 0123"],
    followups: []
  },
  appointment_date: {
    promptIntent: "Collect the appointment date",
    requirement: "a valid date",
    repromptHelp: "Please provide the date you'd like to schedule (e.g., next Monday, March 15).",
    validatorHint: { type: "date" },
    type: "date",
    examplesGood: ["Next Monday", "March 15, 2026", "Tomorrow at 2pm"],
    followups: []
  },
  appointment_time: {
    promptIntent: "Collect the preferred appointment time",
    requirement: "a valid time",
    repromptHelp: "Please provide a time (morning, afternoon, or a specific time).",
    validatorHint: { type: "time" },
    type: "time",
    examplesGood: ["9:00 AM", "Morning", "3:30 PM", "Afternoon"],
    followups: []
  },
  time_preference: {
    promptIntent: "Collect the caller's time preference",
    requirement: "a time preference (morning, afternoon, evening, or specific time)",
    repromptHelp: "What time works best for you?",
    validatorHint: { type: "time" },
    type: "time",
    examplesGood: ["9:00 AM", "Morning", "Afternoon", "2:30 PM"],
    followups: []
  },
  reason_for_visit: {
    promptIntent: "Collect the reason for the appointment or visit",
    requirement: "a clear reason (at least 4 words)",
    repromptHelp: "Could you tell me more about why you're scheduling this visit?",
    validatorHint: { type: "min_words", minWords: 4 },
    type: "text",
    examplesGood: ["Annual checkup", "My back has been hurting", "Regular physical exam"],
    followups: []
  },
  insurance_provider: {
    promptIntent: "Collect or confirm the insurance provider",
    requirement: "insurance provider name or confirmation",
    repromptHelp: "What insurance do you have?",
    validatorHint: { type: "min_words", minWords: 1 },
    type: "text",
    examplesGood: ["Blue Cross", "Aetna", "United Healthcare", "I don't have insurance"],
    followups: []
  },
  new_or_returning: {
    promptIntent: "Determine if the caller is a new or returning patient/customer",
    requirement: "response indicating new or returning status",
    repromptHelp: "Are you a new customer or have you been here before?",
    validatorHint: { type: "choice", options: ["new", "returning"] },
    type: "choice",
    examplesGood: ["I'm new", "Returning customer", "First time"],
    followups: []
  },
  membership_number: {
    promptIntent: "Collect the membership or account number",
    requirement: "membership/account number or identifying information",
    repromptHelp: "Can you provide your membership number or the phone number on your account?",
    validatorHint: { type: "min_words", minWords: 1 },
    type: "text",
    examplesGood: ["Member #123456", "5035550123", "The phone number is 503-555-0123"],
    followups: []
  },
  reason_for_cancellation: {
    promptIntent: "Collect the reason for cancellation",
    requirement: "reason or confirmation of cancellation",
    repromptHelp: "Can you tell me why you'd like to cancel?",
    validatorHint: { type: "min_words", minWords: 2 },
    type: "text",
    examplesGood: ["Too expensive", "Moving out of state", "Not using it anymore"],
    followups: []
  },
  confirmation: {
    promptIntent: "Get confirmation from the caller",
    requirement: "explicit yes or confirmation response",
    repromptHelp: "Is that correct?",
    validatorHint: { type: "choice", options: ["yes", "no"] },
    type: "choice",
    examplesGood: ["Yes", "That's correct", "Confirm"],
    followups: []
  }
};

/**
 * Get a slotSpec template or create a safe generic one
 * @param {string} slotId - The slot identifier
 * @returns {Object} SlotSpec with promptIntent, requirement, repromptHelp, validatorHint
 */
function getSlotSpecTemplateOrGeneric(slotId) {
  if (SLOTSPEC_TEMPLATES[slotId]) {
    return { ...SLOTSPEC_TEMPLATES[slotId] };
  }

  // Safe default for unknown slots
  return {
    promptIntent: "Collect " + slotId.replace(/_/g, ' '),
    requirement: "a helpful answer",
    repromptHelp: "A short answer is fine.",
    validatorHint: { type: "min_words", minWords: 2 },
    type: "text",
    examplesGood: [],
    followups: []
  };
}

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
    completion: { mode: "all_required_slots_complete" },
    roleplayMode: "flex"  // Dynamic scenarios always use flex mode
  };

  // Generate slotSpecs for flexible roleplay mode
  const slotSpecs = {};
  for (let idx = 0; idx < rawScenario.slots.length; idx++) {
    const slotId = rawScenario.slots[idx];
    
    // Get template or generate generic spec
    const baseSpec = getSlotSpecTemplateOrGeneric(slotId);
    
    // Set gating rules
    let gating = false;
    if (slotId === "call_purpose") {
      // call_purpose is always a gating slot (first slot)
      gating = true;
    } else if (slotId === "new_or_returning" || slotId === "new_or_returning_patient") {
      // new/returning status is gating if present
      gating = true;
    } else if (idx === 1 && rawScenario.slots[0] === "call_purpose") {
      // Fallback: second slot (right after call_purpose) is gating
      // only if it's not "questions"
      gating = slotId !== "questions";
    }

    // Set priority for non-gating slots
    let priority = undefined;
    if (!gating && slotId !== "questions") {
      priority = (idx - 1) * 10; // 10, 20, 30... for slots after gating
    }

    // Build final slotSpec
    const slotSpec = {
      promptIntent: baseSpec.promptIntent,
      requirement: baseSpec.requirement,
      repromptHelp: baseSpec.repromptHelp,
      validatorHint: baseSpec.validatorHint,
      type: baseSpec.type || "text"
    };

    if (baseSpec.examplesGood && baseSpec.examplesGood.length > 0) {
      slotSpec.examplesGood = baseSpec.examplesGood;
    }

    if (baseSpec.followups && baseSpec.followups.length > 0) {
      slotSpec.followups = baseSpec.followups;
    }

    if (gating) {
      slotSpec.gating = true;
    }

    if (priority !== undefined) {
      slotSpec.priority = priority;
    }

    slotSpecs[slotId] = slotSpec;
  }

  normalized.slotSpecs = slotSpecs;

  // closingMessage is REQUIRED for dynamic scenarios
  if (!rawScenario.closingMessage || typeof rawScenario.closingMessage !== "string" || rawScenario.closingMessage.trim().length === 0) {
    throw new Error("closingMessage is required and must be a non-empty string");
  }
  normalized.closingMessage = rawScenario.closingMessage.trim();

  // Add pricing if present
  if (rawScenario.pricing) {
    normalized.pricing = rawScenario.pricing;
  }

  // Log dynamic scenario generation
  console.log(
    new Date().toISOString(),
    "[DYNAMIC_SLOT_SPECS]",
    JSON.stringify({
      tag: normalized.tag,
      slots: rawScenario.slots.length,
      mode: normalized.roleplayMode
    })
  );

  return normalized;
}

module.exports = {
  validateAndNormalizeScenario,
  getSlotSpecTemplateOrGeneric,
  SLOTSPEC_TEMPLATES
};

