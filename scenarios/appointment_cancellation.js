const {
  SLOT_CALL_PURPOSE,
  SLOT_CALLER_NAME,
  SLOT_DATE_OF_BIRTH,
  SLOT_REASON_FOR_CANCELLATION,
  SLOT_APPOINTMENT_PREFERENCE,
  SLOT_CONFIRMATION_METHOD,
  SLOT_QUESTIONS
} = require('./slot_library');

module.exports = {
  tag: "appointment_cancellation",
  displayName: "Cancel or reschedule an appointment",
  practiceLabel: "calling a medical office to cancel or reschedule an appointment",
  answererRole: "front desk receptionist at Riverside Medical",
  goalStatement: "Your goal is to successfully cancel or reschedule your appointment, provide your information when asked, and handle any questions the receptionist has.",

  validation: {
    mode: "trust_ai"
  },

  roleplayMode: "flex",

  slotSpecs: {
    call_purpose: {
      ...SLOT_CALL_PURPOSE,
      answererGreeting: "Thank you for calling Riverside Medical, this is Sarah, how can I help you today?"
    },
    patient_name: {
      ...SLOT_CALLER_NAME,
      promptIntent: "Ask for the patient's full name to look up their appointment",
      requirement: "the patient's first and last name",
      repromptHelp: "Ask them to spell their last name if needed",
      gating: true,
      priority: 1
    },
    birthdate: {
      ...SLOT_DATE_OF_BIRTH,
      promptIntent: "Ask for the patient's date of birth to verify their identity",
      gating: true,
      priority: 1
    },
    cancel_or_reschedule: {
      promptIntent: "Ask whether the patient would like to cancel or reschedule their appointment",
      answererGreeting: null,
      requirement: "a clear statement that they want to either cancel or reschedule",
      validatorHint: { type: "keyword", any_of: ["cancel", "cancellation", "reschedule", "rescheduling", "change", "move", "new appointment"] },
      repromptHelp: "Ask directly: would you like to cancel the appointment entirely, or would you prefer to reschedule for a different time?",
      helpIfStuck: null,
      examplesGood: ["I'd like to cancel", "Can we reschedule?", "I need to change my appointment"],
      examplesBad: ["I don't know", "maybe"],
      followups: null,
      loopUntilDone: false,
      loopPromptIntent: null,
      loopDoneHint: null,
      gating: false,
      priority: 2,
      complication: false,
      complicationNote: null
    },
    reason_for_cancellation: {
      ...SLOT_REASON_FOR_CANCELLATION,
      promptIntent: "Politely ask why they need to cancel or reschedule — keep it brief and non-intrusive",
      repromptHelp: "Reassure them any reason is fine, just ask briefly",
      priority: 3
    },
    appointment_preference: {
      ...SLOT_APPOINTMENT_PREFERENCE,
      promptIntent: "If rescheduling, ask for their preferred day and time for the new appointment",
      requirement: "a specific day and time preference, or confirmation they want to cancel without rescheduling",
      repromptHelp: "Ask for a specific day of the week and whether morning or afternoon works better",
      priority: 2
    },
    confirmation_preference: {
      ...SLOT_CONFIRMATION_METHOD,
      promptIntent: "Ask how they would like to receive confirmation of the cancellation or new appointment",
      priority: 3
    },
    questions: {
      ...SLOT_QUESTIONS,
      promptIntent: "Ask if the patient has any other questions before ending the call",
      priority: 4
    }
  },

  slots: [
    "call_purpose",
    "patient_name",
    "birthdate",
    "cancel_or_reschedule",
    "reason_for_cancellation",
    "appointment_preference",
    "confirmation_preference",
    "questions"
  ],

  closingMessage: "Okay, we've got that taken care of for you. Is there anything else I can help you with?",

  closingKeyPhrases: [
    "taken care of",
    "got that",
    "all set",
    "updated",
    "cancelled",
    "rescheduled"
  ],

  completion: {
    minSlots: 4,
    requiredSlots: ["call_purpose", "patient_name", "cancel_or_reschedule"]
  }
};
