/**
 * CallReady Slot Library
 * Central repository of reusable slot definitions for all scenarios.
 * Every possible slot field is present on every slot — set to null if unused.
 * Scenarios import slots and override fields as needed.
 */

'use strict';

/**
 * FULL SLOT TEMPLATE — every possible field
 *
 * promptIntent        {string}       Instruction to AI: what to elicit from the caller
 * answererGreeting    {string|null}  Literal spoken opening line (call_purpose only)
 * requirement         {string}       What counts as a valid answer
 * validatorHint       {object|null}  Validation rule for the caller's response
 * repromptHelp        {string|null}  What the AI says if caller is stuck
 * helpIfStuck         {string|null}  Additional help hint for the AI
 * examplesGood        {Array|null}   Examples of good caller responses
 * examplesBad         {Array|null}   Examples of bad/insufficient caller responses
 * followups           {Array|null}   Conditional follow-up questions
 * loopUntilDone       {boolean}      Whether this slot loops (e.g. questions slot)
 * loopPromptIntent    {string|null}  What to ask on each loop iteration
 * loopDoneHint        {object|null}  Rule for detecting when loop is complete
 * gating              {boolean}      Whether slot blocks progression until complete
 * priority            {number}       Order in which slot is targeted (lower = sooner)
 * complication        {boolean}      Whether this slot introduces a realistic obstacle
 * complicationNote    {string|null}  Description of the complication for coaching context
 */

// ─── UNIVERSAL SLOTS ─────────────────────────────────────────────────────────

const SLOT_CALL_PURPOSE = {
  promptIntent: "Greet the caller and find out why they are calling",
  answererGreeting: null,
  requirement: "confirmation of why they are calling",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: true,
  priority: 1,
  complication: false,
  complicationNote: null
};

const SLOT_QUESTIONS = {
  promptIntent: "Ask if the caller has any questions before ending the call",
  answererGreeting: null,
  requirement: "either confirmation of no further questions or addressing any questions they have",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: "Answer briefly in character, then ask if there is anything else.",
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: true,
  loopPromptIntent: "Ask if they have any other questions.",
  loopDoneHint: {
    type: "keywords_any",
    keywords: ["no", "nope", "that's all", "nothing", "i'm good", "thats it", "all set", "no thanks"],
    minMatches: 1
  },
  gating: false,
  priority: 99,
  complication: false,
  complicationNote: null
};

const SLOT_CLOSING = {
  promptIntent: "Deliver a natural closing statement appropriate to the call outcome",
  answererGreeting: null,
  requirement: "a closing statement has been delivered",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 100,
  complication: false,
  complicationNote: null
};

// ─── IDENTITY / VERIFICATION SLOTS ───────────────────────────────────────────

const SLOT_CALLER_NAME = {
  promptIntent: "Ask for the caller's full name",
  answererGreeting: null,
  requirement: "a full first and last name",
  validatorHint: { type: "name" },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: ["John Smith", "Maria Garcia"],
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: true,
  priority: 2,
  complication: false,
  complicationNote: null
};

const SLOT_ACCOUNT_NUMBER = {
  promptIntent: "Ask for the account number",
  answererGreeting: null,
  requirement: "a numeric account number",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: "If caller doesn't have it handy, offer to look it up another way.",
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: true,
  priority: 3,
  complication: false,
  complicationNote: null
};

const SLOT_DATE_OF_BIRTH = {
  promptIntent: "Ask for the caller's date of birth",
  answererGreeting: null,
  requirement: "a date of birth in any recognizable format",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: ["January 5th 1990", "3/12/85"],
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: true,
  priority: 3,
  complication: false,
  complicationNote: null
};

const SLOT_PHONE_NUMBER_ON_ACCOUNT = {
  promptIntent: "Ask for the phone number on the account",
  answererGreeting: null,
  requirement: "a phone number",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: true,
  priority: 3,
  complication: false,
  complicationNote: null
};

const SLOT_LAST_FOUR_SSN = {
  promptIntent: "Ask for the last four digits of the caller's social security number",
  answererGreeting: null,
  requirement: "four digits",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: true,
  priority: 3,
  complication: false,
  complicationNote: null
};

const SLOT_ADDRESS_ON_ACCOUNT = {
  promptIntent: "Ask for the address on the account",
  answererGreeting: null,
  requirement: "a street address",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: true,
  priority: 3,
  complication: false,
  complicationNote: null
};

// ─── SCHEDULING SLOTS ────────────────────────────────────────────────────────

const SLOT_NEW_OR_RETURNING = {
  promptIntent: "Ask if the caller is a new or returning patient or customer",
  answererGreeting: null,
  requirement: "confirmation of new or returning status",
  validatorHint: {
    type: "keywords_any",
    keywords: ["new", "returning", "existing", "first time", "been before", "already", "current"],
    minMatches: 1
  },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: ["I'm a new patient", "I've been there before"],
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: true,
  priority: 2,
  complication: false,
  complicationNote: null
};

const SLOT_REASON_FOR_VISIT = {
  promptIntent: "Ask for the reason for the appointment or visit",
  answererGreeting: null,
  requirement: "a description of the reason for the appointment",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 4,
  complication: false,
  complicationNote: null
};

const SLOT_INFORMATION_PROVIDED = {
  promptIntent: "You have the information the caller needs — provide it clearly and naturally, then ask if that answers their question",
  answererGreeting: null,
  requirement: "you have spoken the answer to the caller's question and they have responded in any way that shows they heard you — including 'okay', 'thanks', 'got it', 'yeah', 'yep', 'great', 'perfect', 'no I'm good', or any acknowledgment at all",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: ["okay", "thanks", "got it", "yeah", "yep", "great", "perfect", "no I'm good", "that's all I needed"],
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 2,
  complication: false,
  complicationNote: null
};

const SLOT_APPOINTMENT_PREFERENCE = {
  promptIntent: "Ask for the caller's preferred date and time for the appointment",
  answererGreeting: null,
  requirement: "a specific day AND a specific time of day — both are required before this slot is complete. Vague answers like 'Friday afternoon' or 'sometime next week' are not sufficient.",
  validatorHint: { type: "min_words", minWords: 3 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: ["Tuesday at 2pm", "Next Monday morning around 9", "Friday at 3 o'clock"],
  examplesBad: ["Friday afternoon", "sometime next week", "in the morning"],
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 5,
  complication: false,
  complicationNote: null
};

const SLOT_CONFIRMATION_METHOD = {
  promptIntent: "Ask how the caller would like to receive confirmation",
  answererGreeting: null,
  requirement: "a preferred confirmation method such as phone, text, or email",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: ["text me", "email is fine", "just call me"],
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 6,
  complication: false,
  complicationNote: null
};

// ─── CANCELLATION / DISPUTE SLOTS ────────────────────────────────────────────

const SLOT_REASON_FOR_CANCELLATION = {
  promptIntent: "Ask why the caller wants to cancel",
  answererGreeting: null,
  requirement: "a stated reason for cancellation",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 3,
  complication: false,
  complicationNote: null
};

const SLOT_CONFIRMATION_OF_CANCELLATION = {
  promptIntent: "Confirm the cancellation has been processed and provide any reference number",
  answererGreeting: null,
  requirement: "confirmation that cancellation is complete",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 4,
  complication: false,
  complicationNote: null
};

const SLOT_REASON_FOR_DISPUTE = {
  promptIntent: "Ask what charge or issue the caller is disputing",
  answererGreeting: null,
  requirement: "a description of the disputed charge or issue",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 2,
  complication: false,
  complicationNote: null
};

const SLOT_DISPUTED_AMOUNT = {
  promptIntent: "Ask for or confirm the amount being disputed",
  answererGreeting: null,
  requirement: "a dollar amount or description of the disputed charge",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 3,
  complication: false,
  complicationNote: null
};

const SLOT_RESOLUTION_AGREED = {
  promptIntent: "Confirm the agreed resolution with the caller",
  answererGreeting: null,
  requirement: "acknowledgment of the resolution",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 5,
  complication: false,
  complicationNote: null
};

// ─── COMPLICATION SLOTS ───────────────────────────────────────────────────────

const SLOT_RETENTION_OFFER_RESPONSE = {
  promptIntent: "Before processing the cancellation, make a retention offer such as a discount or plan change",
  answererGreeting: null,
  requirement: "caller's clear response to the retention offer — accepting or declining",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: "If unclear, ask directly: would they like to take the offer or proceed with cancellation?",
  helpIfStuck: null,
  examplesGood: ["No thanks, I still want to cancel", "Sure, I'll try the discounted rate"],
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 3,
  complication: true,
  complicationNote: "Agent makes a retention pitch before agreeing to cancel. Caller must hold their ground or negotiate."
};

const SLOT_HOLD_ACKNOWLEDGMENT = {
  promptIntent: "Inform the caller you need to place them on a brief hold to look something up",
  answererGreeting: null,
  requirement: "caller acknowledges the hold",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: ["Sure", "Okay", "That's fine"],
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 3,
  complication: true,
  complicationNote: "Caller is placed on hold mid-call. Tests patience and re-engagement when agent returns."
};

const SLOT_POLICY_PUSHBACK_RESPONSE = {
  promptIntent: "Cite a company policy that complicates or delays the caller's request",
  answererGreeting: null,
  requirement: "caller's response to the policy — pushing back, asking for a supervisor, or accepting",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: ["Can I speak to a supervisor?", "I understand but I'd like an exception"],
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 3,
  complication: true,
  complicationNote: "Agent cites a policy obstacle. Caller must advocate for themselves or escalate."
};

const SLOT_UNEXPECTED_NEWS_RESPONSE = {
  promptIntent: "Deliver unexpected or disappointing news related to the caller's request",
  answererGreeting: null,
  requirement: "caller's response to the unexpected news",
  validatorHint: { type: "min_words", minWords: 2 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 3,
  complication: true,
  complicationNote: "Agent delivers bad news such as unavailability or a problem. Caller must respond constructively."
};

// ─── ORDER / RETAIL SLOTS ─────────────────────────────────────────────────────

const SLOT_ORDER_NUMBER = {
  promptIntent: "Ask for the order number or reference number",
  answererGreeting: null,
  requirement: "an order number or reference number",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: "Suggest the caller check their confirmation email for the order number.",
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: true,
  priority: 2,
  complication: false,
  complicationNote: null
};

const SLOT_ITEM_DESCRIPTION = {
  promptIntent: "Ask which item or product the caller is calling about",
  answererGreeting: null,
  requirement: "a description of the item",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: null,
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 3,
  complication: false,
  complicationNote: null
};

const SLOT_DELIVERY_ADDRESS = {
  promptIntent: "Ask the caller for their delivery address",
  answererGreeting: null,
  requirement: "a complete street address including street number, street name, and city",
  validatorHint: { type: "min_words", minWords: 4 },
  repromptHelp: "Ask them to confirm the full street address including city",
  helpIfStuck: null,
  examplesGood: ["123 Main Street, Portland", "456 Oak Avenue, Springfield"],
  examplesBad: ["my house", "the usual place"],
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 2,
  complication: false,
  complicationNote: null
};

const SLOT_PAYMENT_METHOD = {
  promptIntent: "Ask the caller how they would like to pay",
  answererGreeting: null,
  requirement: "a payment method such as cash, credit card, or debit card",
  validatorHint: { type: "keyword", all_of: ["cash", "credit", "debit", "card", "visa", "mastercard", "amex", "apple pay", "venmo"] },
  repromptHelp: "Ask whether they will be paying with cash or card",
  helpIfStuck: null,
  examplesGood: ["credit card", "cash", "debit card"],
  examplesBad: ["I don't know", "whatever"],
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 2,
  complication: false,
  complicationNote: null
};

const SLOT_PREFERRED_RESOLUTION = {
  promptIntent: "Ask what resolution the caller is looking for",
  answererGreeting: null,
  requirement: "a stated preferred resolution such as refund, exchange, or replacement",
  validatorHint: { type: "min_words", minWords: 1 },
  repromptHelp: null,
  helpIfStuck: null,
  examplesGood: ["I'd like a refund", "Can I exchange it?", "I just want a replacement"],
  examplesBad: null,
  followups: null,
  loopUntilDone: false,
  loopPromptIntent: null,
  loopDoneHint: null,
  gating: false,
  priority: 4,
  complication: false,
  complicationNote: null
};

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
  SLOT_CALL_PURPOSE,
  SLOT_QUESTIONS,
  SLOT_CLOSING,
  SLOT_CALLER_NAME,
  SLOT_ACCOUNT_NUMBER,
  SLOT_DATE_OF_BIRTH,
  SLOT_PHONE_NUMBER_ON_ACCOUNT,
  SLOT_LAST_FOUR_SSN,
  SLOT_ADDRESS_ON_ACCOUNT,
  SLOT_NEW_OR_RETURNING,
  SLOT_REASON_FOR_VISIT,
  SLOT_INFORMATION_PROVIDED,
  SLOT_APPOINTMENT_PREFERENCE,
  SLOT_CONFIRMATION_METHOD,
  SLOT_REASON_FOR_CANCELLATION,
  SLOT_CONFIRMATION_OF_CANCELLATION,
  SLOT_REASON_FOR_DISPUTE,
  SLOT_DISPUTED_AMOUNT,
  SLOT_RESOLUTION_AGREED,
  SLOT_RETENTION_OFFER_RESPONSE,
  SLOT_HOLD_ACKNOWLEDGMENT,
  SLOT_POLICY_PUSHBACK_RESPONSE,
  SLOT_UNEXPECTED_NEWS_RESPONSE,
  SLOT_ORDER_NUMBER,
  SLOT_ITEM_DESCRIPTION,
  SLOT_DELIVERY_ADDRESS,
  SLOT_PAYMENT_METHOD,
  SLOT_PREFERRED_RESOLUTION
};
