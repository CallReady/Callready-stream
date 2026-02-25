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
            gating: true,
            priority: 0
        },

        new_or_returning_patient: {
            promptIntent: "determine if patient is new to the office or returning",
            requirement: "clear indication of whether they are a new or returning patient",
            repromptHelp: "Ask if they have been to this dental office before, or if they are new to the practice.",
            validatorHint: { type: "yes_no" },
            examplesGood: ["I'm a new patient", "I'm returning", "I've been before", "This is my first time"],
            followups: [
                { when: "unclear", ask: "Have you had an appointment with us before?" }
            ],
            gating: true,
            priority: 1
        },

        patient_name: {
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
            promptIntent: "determine if this is routine or for a specific reason",
            requirement: "clear identification of either routine checkup or specific dental concern",
            repromptHelp: "Ask if they're coming for a routine checkup/cleaning, or if there's a specific concern like tooth pain.",
            validatorHint: { type: "min_words", minWords: 3 },
            examplesGood: ["Routine cleaning", "I have tooth pain", "Just a checkup", "My tooth feels loose"],
            followups: [
                { when: "vague", ask: "Is this for a routine checkup, or is there something specific bothering you?" }
            ],
            gating: false,
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
            promptIntent: "collect preferred appointment date and time",
            requirement: "a preferred day and time for the appointment",
            repromptHelp: "Ask what day and time works best, or offer 2-3 available time slots.",
            validatorHint: { type: "min_words", minWords: 2 },
            examplesGood: ["Tuesday at 2pm", "Next week morning", "Friday afternoon", "Monday at 10"],
            followups: [
                { when: "vague", ask: "What time of day works best, morning or afternoon?" }
            ],
            gating: false,
            priority: 70
        },

        confirmation_preference: {
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
            promptIntent: "address any final questions from the patient",
            requirement: "confirmation that patient has no further questions or brief resolution of any questions",
            repromptHelp: "Ask 'Do you have any other questions for me?' If they say no, mark the slot as done.",
            validatorHint: { type: "min_words", minWords: 2 },
            examplesGood: ["No questions", "That sounds good", "All set", "Nope, I'm good"],
            followups: [],
            gating: false,
            loopUntilDone: true,
            loopPromptIntent: "Ask if they have any other questions.",
            loopDoneHint: {
                type: "keywords_any",
                keywords: ["no", "nope", "nah", "that's all", "all set", "nothing else", "nothing more", "i'm good", "all good", "that's it", "that covers it", "we're all set"],
                minMatches: 1
            },
            priority: 90
        }
    },

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

        patient_name: {
            baseQuestion: "What is your full name?",
            waitForResponse: true,
            validation: {
                requirement: "a full name for the patient"
            },
            helpIfStuck: "If unclear, ask them to spell it."
        },

        birthdate: {
            baseQuestion: "What is your date of birth?",
            waitForResponse: true,
            validation: {
                requirement: "a complete date of birth in any common format (MM/DD/YYYY, MM/DD/YY, or spoken date)"
            },
            helpIfStuck: "Accept any format."
        },

        contact_phone: {
            baseQuestion: "What's the best phone number to reach you?",
            waitForResponse: true,
            validation: {
                requirement: "a complete phone number with area code"
            },
            helpIfStuck: "A phone number with area code is needed for confirmation and reminders."
        },

        insurance_provider: {
            baseQuestion: "Do you have dental insurance or will you be self-pay?",
            waitForResponse: true,
            validation: {
                requirement: "either a dental insurance company name or confirmation of self-pay"
            },
            helpIfStuck: "If they have insurance, ask for the company name. Otherwise note self-pay."
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