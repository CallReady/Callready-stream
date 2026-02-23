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
      helpIfStuck: "If unclear, try: 'Are you calling to schedule an appointment?'"
    },
    new_or_returning_patient: {
      baseQuestion: "Are you a new patient or a returning patient?",
      helpIfStuck: "If they are unsure, clarify whether they have visited before."
    },
    birthdate: {
      baseQuestion: "What is your date of birth?",
      helpIfStuck: "Accept any format: MM/DD/YYYY, MM/DD/YY, spoken date, etc."
    },
    patient_name: {
      baseQuestion: "What is your full name?",
      helpIfStuck: "If unclear, ask them to spell it."
    },
    reason_for_appointment: {
      baseQuestion: "What are you coming in for?",
      helpIfStuck: "A brief reason is sufficient. For example: 'checkup', 'broken ankle', 'sore throat'."
    },
    insurance: {
      baseQuestion: "Do you have insurance or are you self-pay?",
      helpIfStuck: "If they have insurance, ask the insurance company name. Otherwise note self-pay."
    },
    appointment_preference: {
      baseQuestion: "What day and time works best for you?",
      helpIfStuck: "If they are unsure, offer two available options."
    },
    confirmation_preference: {
      baseQuestion: "Would you prefer a text reminder, a phone call reminder, or no reminder?",
      helpIfStuck: "Most patients prefer text, but clarify their choice."
    },
    questions_and_closing: {
      baseQuestion: "Do you have any questions for me?",
      helpIfStuck: "If they ask something, answer briefly and naturally in character, then ask if there is anything else."
    }
  },
  
  completion: {
    mode: "all_required_slots_complete"
  }
};
