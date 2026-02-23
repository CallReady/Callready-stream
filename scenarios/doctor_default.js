module.exports = {
  tag: "doctor_default",
  displayName: "Schedule a doctor appointment",
  practiceLabel: "calling a doctor's office to schedule an appointment",
  answererRole: "front desk staff at Evergreen Medical Clinic",
  goalStatement: "Collect required appointment information and schedule a doctor visit.",
  
  slots: [
    "call_purpose",
    "new_or_returning_patient",
    "birthdate",
    "patient_name",
    "reason_for_appointment",
    "insurance",
    "appointment_preference",
    "confirmation_preference",
    "questions_and_closing"
  ],
  
  questions: {
    call_purpose: {
      baseQuestion: "How can I help you today and what is the call about?",
      waitForResponse: true,
      validation: {
        requirement: "confirmation that they want to schedule a doctor appointment"
      },
      helpIfStuck: "If unclear, try: 'Are you calling to schedule an appointment?'"
    },
    new_or_returning_patient: {
      baseQuestion: "Are you a new patient or a returning patient?",
      waitForResponse: true,
      validation: {
        requirement: "confirmation of whether they are a new or returning patient"
      },
      helpIfStuck: "If they are unsure, clarify whether they have visited before."
    },
    birthdate: {
      baseQuestion: "What is your date of birth?",
      waitForResponse: true,
      validation: {
        requirement: "a complete date of birth in any common format (MM/DD/YYYY, MM/DD/YY, or spoken date)"
      },
      helpIfStuck: "Accept any format: MM/DD/YYYY, MM/DD/YY, spoken date, etc."
    },
    patient_name: {
      baseQuestion: "What is your full name?",
      waitForResponse: true,
      validation: {
        requirement: "a full name for the patient"
      },
      helpIfStuck: "If unclear, ask them to spell it."
    },
    reason_for_appointment: {
      baseQuestion: "What are you coming in for?",
      waitForResponse: true,
      validation: {
        requirement: "a brief reason for the appointment (e.g., 'checkup', 'broken ankle', 'sore throat')"
      },
      helpIfStuck: "A brief reason is sufficient. For example: 'checkup', 'broken ankle', 'sore throat'."
    },
    insurance: {
      baseQuestion: "Do you have insurance or are you self-pay?",
      waitForResponse: true,
      validation: {
        requirement: "either an insurance company name or confirmation of self-pay"
      },
      helpIfStuck: "If they have insurance, ask the insurance company name. Otherwise note self-pay."
    },
    appointment_preference: {
      baseQuestion: "What day and time works best for you?",
      waitForResponse: true,
      validation: {
        requirement: "a preferred day and time for their appointment"
      },
      helpIfStuck: "If they are unsure, offer two available options."
    },
    confirmation_preference: {
      baseQuestion: "Would you prefer a text reminder, a phone call reminder, or no reminder?",
      waitForResponse: true,
      validation: {
        requirement: "confirmation of reminder preference (text, phone call, or no reminder)"
      },
      helpIfStuck: "Most patients prefer text, but clarify their choice."
    },
    questions_and_closing: {
      baseQuestion: "Do you have any questions for me?",
      helpIfStuck: "If they ask something, answer briefly and naturally in character, then ask if there is anything else.",
      waitForResponse: true
    }
  },
  
  completion: {
    mode: "all_required_slots_complete"
  }
};
