const {
  SLOT_CALL_PURPOSE,
  SLOT_NEW_OR_RETURNING,
  SLOT_CALLER_NAME,
  SLOT_DATE_OF_BIRTH,
  SLOT_PHONE_NUMBER_ON_ACCOUNT,
  SLOT_REASON_FOR_VISIT,
  SLOT_APPOINTMENT_PREFERENCE,
  SLOT_CONFIRMATION_METHOD,
  SLOT_QUESTIONS
} = require('./slot_library');

module.exports = {
    tag: "dentist_appointment",
    displayName: "Schedule a dentist appointment",
    practiceLabel: "calling a dental office to schedule an appointment",
    answererRole: "front desk staff at Brightsmile Dental Clinic",
    goalStatement: "Collect required appointment information and schedule a dental visit.",

    roleplayMode: "flex",

    validation: {
        mode: "trust_ai"
    },

    slots: [
        "call_purpose",
        "new_or_returning_patient",
        "patient_name",
        "birthdate",
        "contact_phone",
        "insurance_provider",
        "reason_for_appointment",
        "duration_or_last_visit",
        "appointment_preference",
        "confirmation_preference",
        "questions"
    ],

    slotSpecs: {
        call_purpose: {
            ...SLOT_CALL_PURPOSE,
            answererGreeting: "Thanks for calling BrightSmile Dental, this is Mary, how can I help you?",
            promptIntent: "confirm they're calling to schedule an appointment",
            requirement: "confirmation that they are calling about scheduling an appointment",
            repromptHelp: "Ask if they're calling to schedule a dental appointment, or clarify the reason for the call.",
            validatorHint: {
                type: "all_of",
                rules: [
                    { type: "min_words", minWords: 3 },
                    { type: "keywords_any", keywords: ["dentist", "dental", "cleaning", "appointment", "checkup", "schedule"], minMatches: 1 }
                ]
            },
            examplesGood: ["I need to schedule an appointment", "I want to book a cleaning", "I'm calling to see the dentist"],
            followups: [
                { when: "vague", ask: "Just to confirm, you're calling to schedule a dental appointment?" }
            ],
            priority: 0
        },

        new_or_returning_patient: {
            ...SLOT_NEW_OR_RETURNING,
            promptIntent: "determine if patient is new to the office or returning",
            requirement: "clear indication of whether they are a new or returning patient",
            repromptHelp: "Ask if they have been to this dental office before, or if they are new to the practice.",
            validatorHint: { type: "yes_no" },
            examplesGood: ["I'm a new patient", "I'm returning", "I've been before", "This is my first time"],
            followups: [
                { when: "unclear", ask: "Have you had an appointment with us before?" }
            ],
            priority: 1
        },

        patient_name: {
            ...SLOT_CALLER_NAME,
            promptIntent: "collect the patient's full name",
            requirement: "the patient's full name (first and last name)",
            repromptHelp: "Ask for their full name or offer to have them spell it if unclear.",
            validatorHint: { type: "min_words", minWords: 2 },
            examplesGood: ["John Smith", "Sarah Johnson", "Michael Brown", "Lisa Garcia"],
            followups: [],
            gating: false,
            priority: 10
        },

        birthdate: {
            ...SLOT_DATE_OF_BIRTH,
            promptIntent: "collect the patient's date of birth",
            requirement: "a valid date of birth in any common format",
            repromptHelp: "Ask for their date of birth, accepting any common format like MM/DD/YYYY or spoken date.",
            validatorHint: { type: "date" },
            examplesGood: ["January 15, 1990", "12/25/85", "March 3rd '92", "05/10/1978"],
            followups: [
                { when: "missing", ask: "What's your date of birth?" }
            ],
            gating: false,
            priority: 20
        },

        contact_phone: {
            ...SLOT_PHONE_NUMBER_ON_ACCOUNT,
            promptIntent: "collect the patient's phone number",
            requirement: "a complete phone number with area code",
            repromptHelp: "Ask for their phone number with area code, or clarify if the number they gave was incomplete.",
            validatorHint: { type: "phone" },
            examplesGood: ["503-555-0123", "5035550123", "(503) 555-0123", "five-oh-three five-five-five zero one two three"],
            followups: [],
            gating: false,
            priority: 30
        },

        insurance_provider: {
            promptIntent: "determine insurance status and provider",
            requirement: "either a dental insurance provider name or confirmation of self-pay",
            repromptHelp: "If they have dental insurance, ask for the company name. If self-pay, confirm that detail.",
            validatorHint: { type: "min_words", minWords: 1 },
            examplesGood: ["Delta Dental", "Aetna", "I'm self-pay", "Cigna", "No insurance"],
            followups: [
                { when: "vague", ask: "Do you have dental insurance?" }
            ],
            gating: false,
            priority: 40
        },

        reason_for_appointment: {
            ...SLOT_REASON_FOR_VISIT,
            promptIntent: "determine if this is routine or for a specific reason",
            requirement: "clear identification of either routine checkup or specific dental concern",
            repromptHelp: "Ask if they're coming for a routine checkup/cleaning, or if there's a specific concern like tooth pain.",
            validatorHint: { type: "min_words", minWords: 3 },
            examplesGood: ["Routine cleaning", "I have tooth pain", "Just a checkup", "My tooth feels loose"],
            followups: [
                { when: "vague", ask: "Is this for a routine checkup, or is there something specific bothering you?" }
            ],
            priority: 50
        },

        duration_or_last_visit: {
            promptIntent: "gather timeframe for issue or last visit",
            requirement: "either a time duration for a dental issue or timeframe since last dental visit",
            repromptHelp: "If they mentioned an issue, ask how long it's been happening. If routine, ask when they last saw a dentist.",
            validatorHint: { type: "min_words", minWords: 2 },
            examplesGood: ["About 3 days", "A week", "It's been a year since my last visit", "2 months"],
            followups: [
                { when: "missing", ask: "About how long has this been going on?" }
            ],
            gating: false,
            priority: 60
        },

        appointment_preference: {
            ...SLOT_APPOINTMENT_PREFERENCE,
            promptIntent: "tell them what the next available appointment is and confirm if that works",
            requirement: "a specific date (or day name) AND a specific time of day",
            repromptHelp: "I need both a day AND a time. For example: Tuesday at noon, or next Wednesday at 2pm.",
            validatorHint: {
                type: "all_of",
                rules: [
                    { type: "keywords_any", keywords: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "today", "tomorrow", "next week", "this week", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], minMatches: 1 },
                    { type: "keywords_any", keywords: ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "noon"], minMatches: 1 }
                ]
            },
            examplesGood: ["Tuesday at 2pm", "Next Thursday at noon", "Friday at 3pm", "Monday at 10"],
            followups: [
                { when: "vague", ask: "What time of day works best, morning or afternoon?" }
            ],
            priority: 70
        },

        confirmation_preference: {
            ...SLOT_CONFIRMATION_METHOD,
            promptIntent: "collect reminder preference (optional)",
            requirement: "preferred reminder method: text, phone call, or none",
            repromptHelp: "Ask if they prefer a text reminder, phone call, or no reminder.",
            validatorHint: { type: "yes_no" },
            examplesGood: ["Text reminder", "A phone call is fine", "No reminder needed", "Text please"],
            followups: [],
            gating: false,
            priority: 80,
            required: false
        },

        questions: {
            ...SLOT_QUESTIONS,
            promptIntent: "address any final questions from the patient",
            requirement: "confirmation that patient has no further questions or brief resolution of any questions",
            repromptHelp: "Ask 'Do you have any other questions for me?' If they say no, mark the slot as done.",
            validatorHint: { type: "min_words", minWords: 2 },
            examplesGood: ["No questions", "That sounds good", "All set", "Nope, I'm good"],
            followups: [],
            priority: 90
        }
    },


    closingMessage: "Thank you for calling BrightSmile. We look forward to seeing you soon!",

    completion: {
        mode: "all_required_slots_complete"
    }
};
