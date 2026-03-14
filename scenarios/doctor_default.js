const {
  SLOT_CALL_PURPOSE,
  SLOT_NEW_OR_RETURNING,
  SLOT_DATE_OF_BIRTH,
  SLOT_CALLER_NAME,
  SLOT_REASON_FOR_VISIT,
  SLOT_APPOINTMENT_PREFERENCE,
  SLOT_CONFIRMATION_METHOD,
  SLOT_QUESTIONS
} = require('./slot_library');

module.exports = {
  tag: "doctor_default",
  displayName: "Schedule a doctor appointment",
  practiceLabel: "calling a doctor's office to schedule an appointment",
  answererRole: "front desk staff at Evergreen Medical Clinic",
  goalStatement: "Collect required appointment information and schedule a doctor visit.",

  validation: {
    mode: "trust_ai"
  },

  roleplayMode: "flex",

  slotSpecs: {
    call_purpose: {
      ...SLOT_CALL_PURPOSE,
      promptIntent: "Collect the caller's purpose for calling",
      answererGreeting: "Thanks for calling Evergreen Medical Clinic. This is Denise. How can I help you today?",
      requirement: "confirmation that they want to schedule a doctor appointment",
      validatorHint: {
        type: "all_of",
        rules: [
          { type: "min_words", minWords: 3 },
          { type: "keywords_any", keywords: ["appointment", "schedule", "see a doctor", "doctor", "visit"], minMatches: 1 }
        ]
      },
      repromptHelp: "If unclear, try: 'Are you calling to schedule an appointment?'",
      examplesGood: [
        "I need to schedule an appointment",
        "I'd like to see a doctor"
      ],
      followups: [
        { when: "vague", ask: "Just to confirm, you want to schedule a doctor appointment?" },
        { when: "missing", ask: "Is this about scheduling an appointment with us?" }
      ]
    },
    new_or_returning_patient: {
      ...SLOT_NEW_OR_RETURNING,
      promptIntent: "Ask if they are a new patient or returning patient",
      requirement: "confirmation of whether they are new or have visited before",
      validatorHint: {
        type: "keywords_any",
        keywords: ["new", "first time", "never been", "returning", "existing", "been before", "came before", "visited before"]
      },
      repromptHelp: "Clarify: Are you a new patient or have you been here before?",
      examplesGood: [
        "I'm a new patient",
        "I've been there before"
      ],
      followups: [
        { when: "confused", ask: "Have you visited our clinic before?" }
      ]
    },
    birthdate: {
      ...SLOT_DATE_OF_BIRTH,
      promptIntent: "Collect the patient's date of birth",
      requirement: "a complete date of birth in any common format (MM/DD/YYYY, MM/DD/YY, or spoken date)",
      validatorHint: {
        type: "date"
      },
      repromptHelp: "Accept any format: MM/DD/YYYY, MM/DD/YY, spoken date, etc.",
      examplesGood: [
        "March 15th, 1985",
        "03/15/1985",
        "03/15/85"
      ],
      examplesBad: [
        "sometime in March",
        "I don't remember",
        "1985"
      ],
      followups: [
        { when: "vague", ask: "Can you give me the full date - month, day, and year?" },
        { when: "missing", ask: "What's your date of birth?" }
      ],
      gating: false,
      priority: 10
    },
    patient_name: {
      ...SLOT_CALLER_NAME,
      promptIntent: "Ask for the patient's full name",
      requirement: "a complete first and last name",
      repromptHelp: "Please provide your first and last name.",
      gating: false,
      priority: 15
    },
    reason_for_appointment: {
      ...SLOT_REASON_FOR_VISIT,
      promptIntent: "Ask what they need to come in for",
      requirement: "a brief reason for the visit",
      repromptHelp: "What brings you in? For example: checkup, injury, illness, etc.",
      examplesGood: [
        "Annual physical checkup",
        "I have a cough",
        "Knee pain"
      ],
      followups: [
        { when: "vague", ask: "Can you tell me a bit more about what you need help with?" },
        { when: "missing", ask: "Is this for a routine checkup, or something else?" }
      ],
      priority: 30
    },
    insurance: {
      promptIntent: "Ask if they have insurance or are paying out of pocket",
      requirement: "insurance company name or confirmation of self-pay",
      validatorHint: {
        type: "min_words",
        minWords: 2
      },
      repromptHelp: "Do you have insurance, or will you be paying out of pocket?",
      gating: false,
      priority: 50
    },
    appointment_preference: {
      ...SLOT_APPOINTMENT_PREFERENCE,
      promptIntent: "Ask what day and time works best for them",
      requirement: "a specific date (or day name) AND a specific time of day",
      validatorHint: {
        type: "all_of",
        rules: [
          { type: "keywords_any", keywords: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "tomorrow", "next week"], minMatches: 1 },
          { type: "keywords_any", keywords: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "noon", "midnight", "am", "pm", "o'clock", "oclock"], minMatches: 1 }
        ]
      },
      repromptHelp: "I need both a day AND a time. For example: Tuesday morning, or next Wednesday at 2pm.",
      examplesGood: [
        "Tuesday morning",
        "Next week in the afternoon",
        "Any time next Thursday"
      ],
      followups: [
        { when: "vague", ask: "Can you give me both a day AND a time? Like 'Tuesday morning' or 'next week in the afternoon'?" },
        { when: "missing", ask: "When works best - what day and what time of day?" }
      ],
      priority: 40
    },
    confirmation_preference: {
      ...SLOT_CONFIRMATION_METHOD,
      promptIntent: "Ask if they prefer text or phone call for appointment reminder",
      requirement: "confirmation of reminder method",
      validatorHint: {
        type: "keywords_any",
        keywords: ["text", "sms", "message", "phone", "call", "email", "no reminder", "none"]
      },
      repromptHelp: "Would you prefer a text message or phone call reminder?",
      priority: 60
    },
    questions: {
      ...SLOT_QUESTIONS,
      promptIntent: "Ask if they have any questions before closing",
      requirement: "confirmation they have no more questions",
      validatorHint: {
        type: "keywords_any",
        keywords: ["no", "nope", "no questions", "no thanks", "all set", "that's all", "nothing", "good"]
      },
      repromptHelp: "Ask 'Do you have any other questions for me?' If they say no, mark the slot as done.",
      priority: 70
    }
  },

  slots: [
    "call_purpose",
    "new_or_returning_patient",
    "birthdate",
    "patient_name",
    "reason_for_appointment",
    "insurance",
    "appointment_preference",
    "confirmation_preference",
    "questions"
  ],

  closingMessage: "Okay, thanks for scheduling. We'll see you soon!",

  closingKeyPhrases: [
    "thank you",
    "thanks",
    "see you",
    "you soon",
    "appointment",
    "scheduled"
  ],

  completion: {
    mode: "all_required_slots_complete"
  }
};
