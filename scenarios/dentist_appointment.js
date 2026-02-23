module.exports = {
    tag: "dentist_appointment",
    displayName: "Schedule a dentist appointment",
    practiceLabel: "calling a dental office to schedule an appointment",
    answererRole: "front desk staff at Evergreen Dental Clinic",
    goalStatement: "Collect required appointment information and schedule a dental visit.",

    slots: [
        "call_purpose",
        "new_or_returning_patient",
        "birthdate",
        "patient_name",
        "reason_for_appointment",
        "duration_or_last_visit",
        "insurance",
        "appointment_preference",
        "confirmation_preference",
        "questions"
    ],

    questions: {
        call_purpose: {
            baseQuestion: "Thanks for calling BrightSmile Dental, this is Mary, how can I help you?",
            waitForResponse: true,
            validation: {
                requirement: "confirmation that they want to schedule a dentist appointment"
            },
            helpIfStuck: "If unclear, try: 'Are you calling to schedule a dental appointment?'"
        },

        new_or_returning_patient: {
            baseQuestion: "Are you a new patient or a returning patient?",
            waitForResponse: true,
            validation: {
                requirement: "confirmation of whether they are a new or returning patient"
            },
            helpIfStuck: "If they are unsure, clarify whether they have visited this dental office before."
        },

        birthdate: {
            baseQuestion: "What is your date of birth?",
            waitForResponse: true,
            validation: {
                requirement: "a complete date of birth in any common format (MM/DD/YYYY, MM/DD/YY, or spoken date)"
            },
            helpIfStuck: "Accept any format."
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
            baseQuestion: "Are you coming in for a routine checkup and cleaning, or is there a specific dental issue we should know about?",
            waitForResponse: true,
            validation: {
                requirement: "clear identification of either a routine visit or a specific dental concern"
            },
            helpIfStuck: "For example: 'just a cleaning' or 'I have tooth pain on the right side.'"
        },

        duration_or_last_visit: {
            baseQuestion: "If this is for a specific issue, how long has it been going on? If this is for a checkup, when was the last time you saw a dentist?",
            waitForResponse: true,
            validation: {
                requirement: "either a time duration for a dental issue or a timeframe since last dental visit"
            },
            helpIfStuck: "You can answer with something like 'about three days' or 'it has been about a year since my last visit.'"
        },

        insurance: {
            baseQuestion: "Do you have dental insurance or will you be self-pay?",
            waitForResponse: true,
            validation: {
                requirement: "either a dental insurance company name or confirmation of self-pay"
            },
            helpIfStuck: "If they have insurance, ask for the company name. Otherwise note self-pay."
        },

        appointment_preference: {
            baseQuestion: "What day and time works best for you?",
            waitForResponse: true,
            validation: {
                requirement: "a preferred day and time for their appointment"
            },
            helpIfStuck: "If they are unsure, offer two available appointment options."
        },

        confirmation_preference: {
            baseQuestion: "Would you prefer a text reminder, a phone call reminder, or no reminder?",
            waitForResponse: true,
            validation: {
                requirement: "confirmation of reminder preference"
            },
            helpIfStuck: "Most patients prefer text, but clarify their choice."
        },

        questions: {
            baseQuestion: "Do you have any questions for me?",
            waitForResponse: true,
            loopUntilDone: true,
            validation: {
                requirement: "either confirmation of no further questions or addressing any questions they have"
            },
            helpIfStuck: "Answer briefly in character, then ask if there is anything else."
        }


    },

    closingMessage: "Thank you for calling BrightSmile. We look forward to seeing you soon!",

    completion: {
        mode: "all_required_slots_complete"
    }
};