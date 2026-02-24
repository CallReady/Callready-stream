module.exports = {
  tag: "doctor_default",
  displayName: "Schedule a doctor appointment",
  practiceLabel: "calling a doctor's office to schedule an appointment",
  answererRole: "front desk staff at Evergreen Medical Clinic",
  goalStatement: "Collect required appointment information and schedule a doctor visit.",

  validation: {
    mode: "server"
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
  
  questions: {
    call_purpose: {
      baseQuestion: "Thanks for calling Evergreen Medical Clinic. This is Denise. How can I help you today?",
      waitForResponse: true,
      validation: {
        requirement: "confirmation that they want to schedule a doctor appointment"
      },
      helpIfStuck: "If unclear, try: 'Are you calling to schedule an appointment?'"
    },
    new_or_returning_patient: {
      baseQuestion: "For sure, we can do that. Are you a new patient with us or have you been in before?",
      waitForResponse: true,
      validation: {
        requirement: "confirmation of whether they are a new or returning patient"
      },
      helpIfStuck: "If they are unsure, clarify whether they have visited before."
    },
    birthdate: {
      baseQuestion: "Let's access your account. What is your date of birth?",
      waitForResponse: true,
      validation: {
        requirement: "a complete date of birth in any common format (MM/DD/YYYY, MM/DD/YY, or spoken date)"
      },
      helpIfStuck: "Accept any format: MM/DD/YYYY, MM/DD/YY, spoken date, etc."
    },
    patient_name: {
      baseQuestion: "Great, let's verify your information. What is your full name?",
      waitForResponse: true,
      validation: {
        requirement: "a full name for the patient"
      },
      helpIfStuck: "If unclear, ask them to repeat it."
    },
    reason_for_appointment: {
      baseQuestion: "And what are you needing to come in for?",
      waitForResponse: true,
      validation: {
        requirement: "a brief reason for the appointment (e.g., 'checkup', 'broken ankle', 'sore throat')"
      },
      helpIfStuck: "A brief reason is sufficient. For example: 'checkup', 'broken ankle', 'sore throat'."
    },
    insurance: {
      baseQuestion: "Do you have insurance or are you going to pay out of pocket?",
      waitForResponse: true,
      validation: {
        requirement: "either an insurance company name or confirmation of our of pocket"
      },
      helpIfStuck: "If they have insurance, ask the insurance company name. Otherwise note self-pay."
    },
    appointment_preference: {
      baseQuestion: "What day and time would work best for you?",
      waitForResponse: true,
      validation: {
        requirement: "a preferred day and time for their appointment"
      },
      helpIfStuck: "If they are unsure, offer two available options."
    },
    confirmation_preference: {
      baseQuestion: "We can send you a reminder for that appointment. Is text or a phone call better?",
      waitForResponse: true,
      validation: {
        requirement: "confirmation of reminder preference (text, phone call, or no reminder)"
      },
      helpIfStuck: "Most patients prefer text, but clarify their choice."
    },
    questions: {
      baseQuestion: "Alright, I think we're set. Do you have any questions for me?",
      waitForResponse: true,
      loopUntilDone: true,
      validation: {
        requirement: "either confirmation of no further questions or addressing any questions they have"
      },
      helpIfStuck: "If they ask something, answer briefly and naturally in character, then ask if there is anything else."
    }
  },

  closingMessage: "Okay, thanks for scheduling. We'll see you soon!",

  completion: {
    mode: "all_required_slots_complete"
  }
};
