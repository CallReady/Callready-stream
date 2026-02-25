# Roleplay Phase Architecture

## Overview

The roleplay phase is the core of CallReady where users practice realistic phone conversations. The system uses a **config-driven architecture** where scenario files define the conversation flow, questions, and validation rules, while `server.js` enforces those rules deterministically.

---

## Key Components

### 1. Scenario Configuration Files
Located in `/scenarios/`, these define the structure and content of each practice scenario.

**Scenario formats supported:**
- **Legacy**: `questions` format (exact mode) - AI speaks exact questions verbatim
- **New**: `slotSpecs` format (flexible mode) - AI converses naturally while targeting slots
- **Hybrid**: Both formats can coexist for backward compatibility

**Example: `doctor_default.js` (Hybrid Format)**

```javascript
module.exports = {
  tag: "doctor_default",
  displayName: "Schedule a doctor appointment",
  practiceLabel: "calling a doctor's office to schedule an appointment",
  answererRole: "front desk staff at Evergreen Medical Clinic",
  goalStatement: "Collect required appointment information and schedule a doctor visit.",

  validation: {
    mode: "server"  // "server" or "trust_ai"
  },
  
  slots: [
    "call_purpose",
    "new_or_returning_patient",
    "birthdate",
    // ... ordered list of fields to collect
  ],
  
  // NEW: slotSpecs format (enables flexible asking mode)
  slotSpecs: {
    call_purpose: {
      slotId: "call_purpose",
      promptIntent: "Greet the caller warmly and ask how you can help them today",
      requirement: "confirmation that they want to schedule a doctor appointment",
      validatorHint: {
        type: "all_of",
        rules: [
          { type: "min_words", minWords: 3 },
          { type: "keywords_any", keywords: ["appointment", "schedule", "book", "see doctor"] }
        ]
      },
      repromptHelp: "Are you calling to schedule an appointment?",
      gating: true,      // Must be completed before non-gating slots
      priority: 1        // Lower = asked sooner (among non-gating slots)
    },
    birthdate: {
      slotId: "birthdate",
      promptIntent: "Ask for their date of birth to look up their patient record",
      requirement: "a complete date of birth",
      validatorHint: {
        type: "date",
        examples: ["MM/DD/YYYY", "January 15, 1990", "01/15/90"]
      },
      repromptHelp: "Please provide your date of birth in any format.",
      gating: false,
      priority: 10
    }
    // ... one entry per slot
  },
  
  // LEGACY: questions format (fallback for exact mode)
  questions: {
    call_purpose: {
      baseQuestion: "Thanks for calling Evergreen Medical Clinic. This is Denise. How can I help you today?",
      transitionPhrase: "",  // Optional: exact phrase to say before question
      waitForResponse: true,
      validation: {
        requirement: "confirmation that they want to schedule a doctor appointment",
        rule: { type: "min_length", minLength: 5 }
      },
      helpIfStuck: "If unclear, try: 'Are you calling to schedule an appointment?'"
    },
    birthdate: {
      baseQuestion: "What is your date of birth?",
      validation: {
        requirement: "a complete date of birth",
        rule: { type: "date" }
      },
      helpIfStuck: "Accept any format: MM/DD/YYYY, MM/DD/YY, spoken date, etc."
    }
    // ... one entry per slot
  },
  
  closingMessage: "Thank you for scheduling. We'll see you soon!"
};
```

**Key Fields:**
- **`tag`**: Unique identifier for the scenario
- **`slots`**: Ordered array of field IDs defining the conversation flow
- **`slotSpecs`** (NEW): Natural conversation format with flexible asking
  - `promptIntent`: What the AI should accomplish (not exact words)
  - `requirement`: What information is needed
  - `validatorHint`: Validation rules (takes priority over questions.validation.rule)
  - `repromptHelp`: Clarification text for retries
  - `gating`: Boolean (default: false). If true, must be completed before non-gating slots
  - `priority`: Number (default: 100). Lower values asked sooner among non-gating slots
- **`questions`** (LEGACY): Exact question format
  - `baseQuestion`: The exact question the AI must ask verbatim
  - `transitionPhrase`: Optional phrase to say before the question
  - `validation.requirement`: Human-readable description of what's needed
  - `validation.rule`: Validation rules
  - `helpIfStuck`: Clarification text for retry attempts
- **`validation.mode`**: Controls how responses are validated
  - `"server"`: Server validates using validation rules (strict, with retries)
  - `"trust_ai"`: AI decides if response is valid (flexible, no retries)
- **`closingMessage`**: Final message after all slots are collected

**Mode Selection:**
- If `slotSpecs` exists → **Flexible mode** (natural conversation)
- If only `questions` exists → **Exact mode** (verbatim questions)
- If both exist → **Flexible mode** (slotSpecs takes priority)

---

## 2. Roleplay Phase Lifecycle

### Phase Entry
When the user enters the roleplay phase (after choosing a scenario):

1. **Scenario Resolution** (`server.js` line ~7450+)
   - System looks up scenario from registry via `resolveScenarioWithDynamic()`
   - For dynamic scenarios (tag starts with `dynamic_`), fetches from dynamic store
   - For static scenarios, loads from `/scenarios/[tag].js`

2. **Scenario Normalization** (`server.js` line ~6044+)
   - Calls `normalizeScenarioConfig()` to convert scenario to internal format
   - If scenario has `slotSpecs` → use as-is
   - If only `questions` exist → auto-convert to `slotSpecs` format
   - Stores normalized version in `callState.scenarioNormalized`
   - Original config preserved in `callState.scenarioConfig`

3. **Checklist Initialization** (`server.js` line ~3750+)
   - Builds checklist object from scenario's `slots` array
   - Each slot becomes: `{ required: true, done: false, value: null }`
   - Checklist structure: `callState.checklist[slotId] = { required, done, value }`
   - Initializes turn result storage: `lastTurnResult: null`, `turnResults: []`
   - Stored in `callState.scenarioConfig` for reference

4. **Initial Greeting** (`server.js` line ~6490+)
   - After ring audio plays, system sends first question
   - **Exact mode**: Uses `questions[slots[0]].baseQuestion` verbatim
   - **Flexible mode**: Uses `slotSpecs[slots[0]].promptIntent` as guidance
   - Starts turn-by-turn conversation

---

## 3. Turn-by-Turn Flow

### A. AI Asks Question

**Instruction Generation** (`server.js` line ~5090+, `buildPhaseInstructions()`)

When it's the AI's turn to speak, the system:

1. **Resolves Next Target Slot** (`getNextTurnSpec()` at line ~5850+)
   - Finds first incomplete required slot from `scenario.slots` array
   - Returns spec with:
     - `nextTargetSlotId`: The field to collect
     - `baseQuestion`: Exact question to ask
     - `validation`: Validation rules for this field
     - `transitionPhrase`: Optional transition (if configured)
     - `helpIfStuck`: Clarification text for retries

2. **Checks for Validation Failure** (line ~5370+)
   - If `callState.validationFailedFor === nextTargetSlotId`:
     - **Unrelated response**: Acknowledges caller question, returns to target
     - **Invalid response**: Provides `repromptHelp` text or validation requirement
   - Then asks for the target information again

3. **Builds Mode-Specific Instructions** (line ~5120+)
   
   **EXACT MODE** (when only `questions` format exists):
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ⚠️  YOU MUST SPEAK THE EXACT WORDS BELOW - NO PARAPHRASING
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   
   SPEAK EXACTLY:
   
       "[baseQuestion]"
   
   Do NOT add any words before or after the quoted question.
   
   Then STOP and WAIT for their response.
   ```
   
   **FLEXIBLE MODE** (when `slotSpecs` exists):
   ```
   CURRENT TARGET: [nextTargetSlotId]
   PROMPT INTENT: [promptIntent]
   REQUIREMENT: [requirement]
   VALIDATION HINT: [validatorHint rules]
   
   HARD RULES:
   1. Speak naturally as a real [answererRole].
   2. Ask only ONE question at a time (for the current target field).
   3. You may answer a brief caller question in 1-2 sentences, then return.
   4. Do NOT invent new required information.
   5. Do NOT change slot order or decide when the call is complete.
   6. When you believe you got an acceptable answer, call:
      mark_checklist_item_complete(field_id='...', value='...')
   7. After speaking, call report_turn_result with your analysis
   8. After speaking, STOP and WAIT for their response.
   ```

4. **Sends to OpenAI Realtime API** (line ~6996+)
   - Via `openaiResponseCreate()` with `modalities: ["audio", "text"]`
   - AI speaks according to mode (exact vs flexible)
   - In flexible mode, AI also calls `report_turn_result` tool

---

### B. Caller Responds

**Transcription** (`server.js` line ~6600+)

When caller speaks:

1. **Speech Detection** (line ~6982+)
   - `input_audio_buffer.speech_started`: Marks that caller is speaking
   - `input_audio_buffer.speech_stopped`: Triggers AI response

2. **Transcription Capture** (line ~6600+)
   - Event: `conversation.item.input_audio_transcription.completed`
   - Stores in `callState.lastUserUtterance`
   - Adds to `callState.roleplayTranscript[]` for coaching feedback

3. **Auto-Completion Check** (line ~6670+, only if validation mode is `"server"`)
   
   **EXACT MODE** (legacy):
   - Gets current target slot from `getNextTurnSpec()`
   - Validates response using `validateCallerResponse()` (line ~4760+)
   - **If valid**: Marks checklist complete immediately
   
   **FLEXIBLE MODE** (AI-assisted extraction):
   - Calls `extractSlotFromUtterance()` to get AI extraction
   - AI analyzes utterance and returns:
     - `value`: Extracted slot value
     - `confidence`: "low", "medium", or "high"
     - `callerQuestionDetected`: Whether caller asked a question
     - `callerQuestionSummary`: Brief summary if question detected
   - **If confidence is medium/high AND validates**:
     - Marks `callState.checklist[slotId].done = true`
     - Stores extracted value in checklist
     - Clears any validation failure flags
     - Logs `[AUTO_SLOT_COMPLETE_AI]` with confidence
   - **If confidence is low OR validation fails**:
     - Sets `callState.validationFailedFor = slotId`
     - Sets `callState.validationFailedUnrelated = true` if question detected
     - Increments `callState.validationFailCounts[slotId]`
     - Logs `[AUTO_SLOT_FAIL_AI]` with details
     - Next turn will include clarification/retry instructions
   
   **Deduplication**:
   - Uses `callState.lastExtractionUtteranceHash` to prevent double-extraction
   - Only extracts once per unique caller utterance
   - Falls back to basic validation if extraction fails

---

### C. AI Tool Call (Parallel with Speaking)

**Function Call Handling** (`server.js` line ~7060+)

While the AI responds, it can also call `mark_checklist_item_complete()`:

1. **Tool Call Received** (line ~7063+)
   - Function: `mark_checklist_item_complete(field_id, value)`
   - AI calls this after collecting information
   - Server validates the call

2. **Validation Gates** (line ~7086+)
   - **Slot ID Validation**: Ensures `field_id` exists in `scenario.slots`
   - **Order Enforcement**: Rejects if `field_id !== currentTarget`
   - **Response Validation**: (if `validation.mode === "server"`)
     - Calls `validateCallerResponse(utterance, fieldConfig, field_id)`
     - Uses rules from `questions[field_id].validation.rule`
     - **If invalid**: Rejects tool call, sets retry flags
     - **If valid**: Marks checklist item complete

3. **Checklist Update** (line ~7147+)
   - Sets `callState.checklist[field_id].done = true`
   - Sets `callState.checklist[field_id].value = value`
   - Clears validation failure flags for this field
   - Logs `[CHECKLIST_COMPLETE]` event

---

## 4. Validation System

### Server-Side Validation (`validateCallerResponse()` at line ~4760+)

**Rule Types Supported:**

```javascript
validation: {
  requirement: "a complete date of birth",
  rule: {
    type: "date"  // or: "name", "phone", "time", "yes_no", "enum", etc.
  }
}
```

**Common Rule Types:**
- **`date`**: Detects dates in various formats (MM/DD/YYYY, month names, etc.)
- **`name`**: Requires 2+ words with letters
- **`phone`**: Requires 10+ digits
- **`time`**: Detects times (3:30pm, morning, etc.)
- **`enum`**: Matches against specific values
- **`regex`**: Custom regex pattern
- **`min_length`**: Minimum character count
- **`keywords`**: Contains specific words

**Validation Flow:**
1. Deflection check: Rejects "I don't know", "not sure", etc.
2. Rule evaluation: Tests utterance against rule type
3. Returns `true` (valid) or `false` (invalid)

---

### Retry Behavior (Server Validation Mode Only)

When validation fails:

1. **First Retry** (line ~5215+)
   - Says: `[helpIfStuck text]` or `"Just to clarify, I need [requirement]."`
   - Then repeats: `[baseQuestion]` (exact same question)

2. **Unrelated Response** (line ~5217+)
   - If caller asked a question instead of answering
   - Says: `"We'll get to that in a moment, but first I need to ask:"`
   - Then: `[baseQuestion]`

3. **Multiple Retries**
   - System tracks `callState.validationFailCounts[field_id]`
   - No limit on retries (caller can keep trying)
   - Always uses same clarification + exact question

---

## 5. Completion Flow

### All Slots Complete

**Detection** (`server.js` line ~8092+)

After each response, system checks:

```javascript
const allDone = Object.keys(callState.checklist).every(
  id => !callState.checklist[id].required || callState.checklist[id].done
);
```

**Deterministic Closing Gate** (Flexible Mode Only)

The roleplay phase uses a state machine gate to reliably transition from slot collection to closing:

```javascript
callState.roleplayGate: "collecting"  // Default state while collecting slots
callState.roleplayGate: "closing_pending"  // Server determined allDone && !needsClosing
callState.roleplayGate: "closing_delivered"  // AI delivered closing OR fail-safe triggered
```

**State Transitions**:

1. **collecting → closing_pending** (line ~8098+)
   - Trigger: `allDone && roleplayGate === "collecting"`
   - Server sets: `roleplayGate = "closing_pending"` and `needsClosing = true`
   - Log: `[CLOSING_GATE] state=closing_pending`
   - Next turn delivers closing instructions

2. **closing_pending → closing_delivered** (multiple paths):
   
   **Path A: Via report_turn_result** (line ~7848+)
   - AI calls `report_turn_result(wants_to_close_now=true)`
   - Server checks: `roleplayGate === "closing_pending" && allDone`
   - If valid: `roleplayGate = "closing_delivered"`, log `[CLOSING_GATE] state=closing_delivered`
   - If invalid (not allDone): log `[CLOSING_REJECT] reason=not_all_done`
   
   **Path B: Via mark_checklist_item_complete** (line ~7914+)
   - AI calls `mark_checklist_item_complete(field_id='__closing__', value='delivered')`
   - Server checks: `roleplayGate === "closing_pending"`
   - Sets: `roleplayGate = "closing_delivered"`, log `[CLOSING_GATE] state=closing_delivered`
   
   **Path C: Fail-safe Auto-Mark** (line ~8078+)
   - If closing audio generated but AI forgot to call tools
   - Trigger: `roleplayGate === "closing_pending" && closingDelivered === false && cleanedText`
   - Server auto-sets: `roleplayGate = "closing_delivered"`
   - Log: `[CLOSING_GATE_AUTO] state=closing_delivered (fail-safe)`

3. **closing_delivered → coaching** (line ~8109+)
   - Trigger: `allDone && roleplayGate === "closing_delivered"`
   - Server transitions to `phase = "coaching"`
   - Stores transcript and scenario for coaching context
   - Redirects to coaching webhook

**Closing Message Delivery** (line ~5395+)

When `roleplayGate === "closing_pending"`:

1. **Instructions** (Flexible Mode Only)
   ```
   ALL REQUIRED INFORMATION COLLECTED!
   
   CLOSING PHASE:
   Deliver a natural closing message based on:
   "[scenario.closingMessage]"
   
   INCLUDE at least one of these key phrases: [scenario.closingKeyPhrases]
   
   You may paraphrase naturally, but keep the key idea.
   Do NOT ask any new questions.
   Do NOT wait for a response.
   
   Immediately call these two functions:
   1. mark_checklist_item_complete(field_id='__closing__', value='delivered')
   2. report_turn_result(target_slot_id='__closing__', ..., wants_to_close_now=true)
   ```

2. **Optional Closing Key Phrases** (Scenario Config)
   ```javascript
   closingKeyPhrases: [
     "thank you",
     "thanks",
     "see you",
     "appointment",
     "scheduled"
   ]
   ```
   - If provided, AI includes at least one phrase
   - If not provided, AI delivers natural closing freely
   - Backward compatible (optional field)

3. **Transition to Coaching** (line ~8109+)
   - Waits for closing audio to finish playing
   - Delays `COACHING_REDIRECT_DELAY_MS` (1200ms) + remaining audio time
   - Only transitions when `roleplayGate === "closing_delivered"`
   - Redirects to `/gather-coaching-feedback` via Twilio REST API
   - Closes WebSocket connection

**Benefits of Closing Gate**:
- **Deterministic transitions**: Server always knows closing is delivered before redirecting
- **No race conditions**: Three explicit paths, all result in clear state
- **Fail-safe reliability**: Auto-mark triggers even if AI forgets tool calls
- **Natural closing**: AI can paraphrase while maintaining key phrases
- **Flexible + Legacy**: Only applies in flexible mode, exact mode unchanged

---

## 6. Key Data Structures

### Call State
```javascript
callState = {
  phase: "roleplay",
  scenarioTag: "doctor_default",
  scenarioConfig: { /* loaded scenario object */ },
  
  checklist: {
    call_purpose: { required: true, done: false, value: null },
    new_or_returning_patient: { required: true, done: false, value: null },
    // ... one entry per slot
  },
  
  lastUserUtterance: "I need to schedule an appointment",
  
  roleplayTranscript: [
    { speaker: "ai", text: "Thanks for calling...", timestamp: 1234567890 },
    { speaker: "caller", text: "I need to schedule...", timestamp: 1234567891 }
  ],
  
  needsClosing: false,
  closingDelivered: false,
  roleplayGate: \"collecting\",           // Deterministic closing gate (collecting | closing_pending | closing_delivered)
  
  validationFailedFor: null,              // slot ID that failed validation
  validationFailedUnrelated: false,       // true if caller asked unrelated question
  validationFailedAt: 1234567890,        // timestamp of failure
  validationFailCounts: {                 // retry count per slot
    birthdate: 2
  }
}
```

### Turn Spec (from `getNextTurnSpec()`)
```javascript
{
  scenarioTag: "doctor_default",
  answererRole: "front desk staff at Evergreen Medical Clinic",
  nextTargetSlotId: "birthdate",
  baseQuestion: "What is your date of birth?",
  transitionPhrase: "",
  helpIfStuck: "Accept any format: MM/DD/YYYY, MM/DD/YY, spoken date, etc.",
  validation: {
    requirement: "a complete date of birth",
    rule: { type: "date" }
  },
  waitForResponse: true,
  loopUntilDone: false
}
```

---

## 7. Special Cases

### Loop-Until-Done Fields

Some slots continue until explicitly finished (e.g., "questions"):

```javascript
questions: {
  questions: {
    baseQuestion: "Do you have any questions for me?",
    loopUntilDone: true,
    validation: {
      requirement: "confirmation that caller has no more questions"
    }
  }
}
```

**Behavior:**
- AI asks question
- If caller has questions: AI answers, then asks "Any other questions?"
- When caller says "no", "that's all", etc.: Marks complete and moves on
- Detection regex matches: "no", "nope", "i'm good", "that's all", etc.

---

### Dynamic Scenarios

Scenarios with tag starting with `dynamic_`:

1. **Storage**: Stored in `twilioCoachingContexts` Map (in-memory)
2. **Resolution**: Retrieved via `getDynamicScenario(callSid)` (line ~1850+)
3. **Use Case**: User-generated custom scenarios
4. **Same Flow**: Uses identical roleplay logic as static scenarios

---

## 8. Logging and Debugging

### Key Log Events

- `[CONFIG_DRIVEN_MODE] ACTIVATED`: Confirm using exact questions
- `[CHECKLIST_COMPLETE]`: Slot marked complete
- `[CHECKLIST_VALIDATION] Rejected tool call`: Validation failed, retry needed
- `[CHECKLIST_ORDER] Rejected tool call`: AI tried to mark wrong slot
- `[AUTO_COMPLETE]`: Server auto-marked slot from transcription
- `[AUTO_SLOT_COMPLETE_AI]`: AI extraction succeeded (flexible mode)
- `[AUTO_SLOT_FAIL_AI]`: AI extraction failed, retry needed (flexible mode)
- `[AUTO_COMPLETE_FALLBACK]`: Extraction failed, used basic validation
- `[EXTRACTION]`: AI slot extraction attempt details
- `[CLOSING_GATE] state=closing_pending`: Deterministic gate transition (all slots done, ready to close)
- `[CLOSING_GATE] state=closing_delivered`: Closing delivered via tool call or report_turn_result
- `[CLOSING_GATE_AUTO] state=closing_delivered`: Fail-safe auto-mark (AI spoke but forgot tool)
- `[CLOSING_REJECT] reason=not_all_done`: AI tried to close but slots still pending
- `[COACHING_TRANSITION]`: Moving to coaching phase
- `[TURN_RESULT]`: AI reported turn analysis (flexible mode)
- `[TURN_RESULT_MISSING]`: AI forgot to call report_turn_result
- `[TURN_RESULT_INVALID_SLOT]`: AI reported invalid target_slot_id
- `[TURN_RESULT_DETECTED_UNRELATED]`: Caller asked question instead of answering
- `[MULTI_QUESTION_WARN]`: AI asked multiple questions in one turn
- `[FLEX_REPROMPT]`: Turn result triggered flexible mode reprompt
- `[AI_SUGGESTED_SLOT]`: AI suggested next slot accepted by server
- `[NEXT_SLOT_REJECT]`: AI suggested invalid next slot (with reason: gating_required or not_allowed)

### Troubleshooting

**Issue: AI not asking exact questions**
- Check: `[CONFIG_DRIVEN_MODE] ACTIVATED` appears in logs
- Check: Scenario has `questions[slotId].baseQuestion` defined
- Check: `buildPhaseInstructions()` is being called (not `buildPhaseContext()`)

**Issue: Validation always failing**
- Check: `validation.mode` in scenario (should be "server" for strict validation)
- Check: `validation.rule` type matches expected input format
- Check: `[CHECKLIST_VALIDATION] Rejected` logs show what failed
- Check: `validatorHint` in slotSpecs (takes priority over validation.rule)

**Issue: Questions out of order**
- Check: `slots` array order in scenario file
- Check: `[CHECKLIST_ORDER] Rejected` logs show if AI tried wrong slot
- Ensure: Only one slot is incomplete at a time (no skipping)

**Issue: Not transitioning to coaching**
- Check: `[CLOSING_GATE] state=closing_pending` appears (all slots done)
- Check: `[CLOSING_GATE] state=closing_delivered` OR `[CLOSING_GATE_AUTO]` appears (closing delivered)
- Check: `[COACHING_TRANSITION]` appears (redirect triggered)
- Verify: `scenario.closingMessage` is defined
- Verify: `roleplayGate === "closing_delivered"` before coaching transition

**Issue: Closing not delivered reliably**
- Check: `[CLOSING_GATE] state=closing_pending` appears
- Check: Either `[CLOSING_GATE] state=closing_delivered` (tool called) OR `[CLOSING_GATE_AUTO]` (fail-safe)
- If neither: AI failed to speak closing and fail-safe didn't trigger
- Verify: AI received closing instructions with roleplayGate === "closing_pending"

**Issue: AI not calling report_turn_result**
- Check: Scenario has `slotSpecs` (flexible mode requirement)
- Check: `[TURN_RESULT_MISSING]` appears in logs
- Verify: Flexible asking instructions include report_turn_result requirement

**Issue: Caller questions not handled properly**
- Check: `[TURN_RESULT]` log shows `q: true` when caller asks questions
- Check: `validationFailedUnrelated` flag gets set
- Verify: AI receives "VALIDATION RETRY - UNRELATED RESPONSE" instruction

---

## 9. File Map

**Core Roleplay Logic:**
- `server.js` line 4555-4630: Call state initialization (includes roleplayGate, lastTurnResult, turnResults[], lastExtractionUtteranceHash)
- `server.js` line 5090-5250: Phase instructions builder (CONFIG-DRIVEN)
- `server.js` line 5137-5156: shouldUseFlexibleAsking() feature flag
- `server.js` line 5230-5430: Flexible asking mode instructions with turn result integration
- `server.js` line 5395-5430: Closing gate instructions with closingKeyPhrases support
- `server.js` line 6190-6240: normalizeScenarioConfig() - converts questions to slotSpecs with gating/priority defaults
- `server.js` line 6268-6310: getRemainingSlotIds() helper - gets uncompleted required slots
- `server.js` line 6312-6340: getAllowedNextSlotIds() helper - applies gating rules to determine allowed slots
- `server.js` line 6342-6480: getNextTurnSpec() - next turn spec resolver with flexible ordering and AI suggestions
- `server.js` line 4740-4850: extractSlotFromUtterance() - AI-assisted value extraction
- `server.js` line 4850-5050: Validation rules engine (includes new rule types)
- `server.js` line 6600-6755: Caller transcription & auto-complete
- `server.js` line 7180-7300: AI-assisted auto-completion with extraction (flexible mode)
- `server.js` line 6649-6710: Tool definitions (mark_checklist_item_complete + report_turn_result)
- `server.js` line 7780-7870: Tool call handling & validation
- `server.js` line 7830-7870: report_turn_result handler with closing gate support
- `server.js` line 7900-7930: mark_checklist_item_complete handler with closing gate support
- `server.js` line 8074-8088: Fail-safe auto-close (closing gate)
- `server.js` line 8092-8115: Closing gate state machine (collecting → closing_pending → closing_delivered)
- `server.js` line 8109-8150: Coaching transition with closing_delivered gate check

**Scenario Files:**
- `scenarios/doctor_default.js`: Static doctor appointment scenario (includes slotSpecs examples)
- `scenarios/pizza_order.js`: Static pizza ordering scenario
- `scenarios/dentist_appointment.js`: Static dentist appointment scenario
- `scenarios/dynamic_*.js`: Utilities for dynamic scenario generation

---

## 10. Advanced Features

### Dual-Mode Architecture: Exact vs Flexible Asking

The system supports **two conversation modes** that can coexist in the same scenario:

**EXACT MODE (Legacy)**
- AI must speak the exact `baseQuestion` verbatim
- Instruction: "SPEAK EXACTLY: [baseQuestion]"
- Used when scenario only has `questions` format
- Deterministic, predictable questions
- Best for precise script practice

**FLEXIBLE MODE (New)**
- AI converses naturally while targeting the same slot
- Receives `promptIntent` and `requirement` instead of exact question
- Can answer caller questions briefly (1-2 sentences)
- Returns to current target after answering
- Used when scenario has `slotSpecs` format
- More natural conversation while maintaining server control

**Mode Selection** (`shouldUseFlexibleAsking()` at line ~5137+):
```javascript
function shouldUseFlexibleAsking(callState) {
  const normalized = callState.scenarioNormalized;
  return normalized && normalized.slotSpecs && Object.keys(normalized.slotSpecs).length > 0;
}
```

If `slotSpecs` exist → Flexible mode  
If only `questions` exist → Exact mode

---

### slotSpecs Format (New Scenario Format)

**Purpose**: Future-ready scenario format enabling flexible asking mode

**Structure**:
```javascript
module.exports = {
  tag: "example_scenario",
  slots: ["call_purpose", "birthdate"],
  
  // NEW: slotSpecs format (flexible mode)
  slotSpecs: {
    call_purpose: {
      slotId: "call_purpose",
      promptIntent: "Greet and ask why they're calling",
      requirement: "confirmation they want to schedule an appointment",
      validatorHint: {
        type: "all_of",
        rules: [
          { type: "min_words", minWords: 3 },
          { type: "keywords_any", keywords: ["appointment", "schedule", "book"] }
        ]
      },
      repromptHelp: "Are you calling to schedule an appointment?"
    },
    birthdate: {
      slotId: "birthdate",
      promptIntent: "Ask for their date of birth for patient lookup",
      requirement: "a complete date of birth",
      validatorHint: {
        type: "date",
        examples: ["MM/DD/YYYY", "January 15, 1990", "01/15/90"]
      },
      repromptHelp: "Please provide your date of birth in any format."
    }
  },
  
  // LEGACY: questions format still supported (exact mode fallback)
  questions: {
    call_purpose: {
      baseQuestion: "Thanks for calling. How can I help you?",
      validation: {
        requirement: "confirmation they want to schedule an appointment",
        rule: { type: "min_length", minLength: 5 }
      }
    }
    // ...
  }
};
```

**Key Fields**:
- **`promptIntent`**: Natural language guidance for AI on what to ask
- **`requirement`**: What information is needed (same as validation.requirement)
- **`validatorHint`**: Validation rules (takes priority over questions.validation.rule)
- **`repromptHelp`**: Clarification text for validation retries

**Backward Compatibility**: Scenarios can have BOTH formats. The system normalizes everything to slotSpecs internally.

---

### Scenario Normalization (`normalizeScenarioConfig()`)

**Purpose**: Convert legacy `questions` format to `slotSpecs` format internally

**Location**: `server.js` line ~6044+

**Process**:
1. If scenario already has `slotSpecs` → use as-is
2. If only `questions` exist → convert each to slotSpec:
   ```javascript
   slotSpecs[slotId] = {
     slotId: slotId,
     promptIntent: "Ask: " + questions[slotId].baseQuestion,
     requirement: questions[slotId].validation?.requirement || "a valid response",
     validatorHint: questions[slotId].validation?.rule || null,
     repromptHelp: questions[slotId].helpIfStuck || null
   };
   ```
3. Store normalized version in `callState.scenarioNormalized`

**Effect**: All scenarios work in both modes regardless of original format.

---

### Enhanced Validation System

#### Validation Priority Chain

When validating caller responses, the system uses this priority:

1. **`slotSpec.validatorHint`** (highest priority)
2. **`fieldConfig.validation.rule`**
3. **`fieldConfig.validation`** object (basic validation)

This allows `slotSpecs` to override legacy validation rules.

#### New Validation Rule Types

**`min_words`**: Requires minimum word count
```javascript
validatorHint: {
  type: "min_words",
  minWords: 3
}
```

**`keywords_any`**: Matches if ANY keyword present
```javascript
validatorHint: {
  type: "keywords_any",
  keywords: ["appointment", "schedule", "book", "see doctor"]
}
```

**`not_a_question`**: Rejects if utterance is a question
```javascript
validatorHint: {
  type: "not_a_question"
}
```

**`all_of`**: Combines multiple rules (AND logic)
```javascript
validatorHint: {
  type: "all_of",
  rules: [
    { type: "min_words", minWords: 3 },
    { type: "keywords_any", keywords: ["appointment"] },
    { type: "not_a_question" }
  ]
}
```

#### Short Utterance Rejection

Responses with ≤2 words are automatically rejected UNLESS the field type is:
- `yes_no`
- `enum`

This prevents "okay", "sure", "uh huh" from passing validation.

#### Enhanced Deflection Detection

Expanded phrase list catches more deflections:
- "i don't know"
- "not sure"
- "no idea"
- "can't remember"
- "don't have that"
- "don't recall"
- And more...

---

### report_turn_result Tool (Flexible Mode Only)

**Purpose**: Provide structured turn metadata so server can make better decisions while AI speaks naturally

**When Used**: Every turn in flexible asking mode

**Tool Definition** (`server.js` line ~6649+):
```javascript
{
  type: "function",
  name: "report_turn_result",
  description: "Report analysis of this conversation turn (flexible mode only)",
  parameters: {
    type: "object",
    properties: {
      target_slot_id: {
        type: "string",
        description: "The slot you are currently asking about"
      },
      caller_question_detected: {
        type: "boolean",
        description: "True if caller asked a question instead of answering"
      },
      caller_question_summary: {
        type: "string",
        description: "Brief summary of caller's question (if detected)"
      },
      extracted: {
        type: "string",
        description: "The value you extracted from caller's response"
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Confidence in the extracted value"
      },
      should_reprompt: {
        type: "boolean",
        description: "True if you think you need to ask again"
      },
      reprompt_reason: {
        type: "string",
        description: "Why you think reprompt is needed"
      },
      suggested_next_slot_id: {
        type: "string",
        description: "The slot you think should be next (if different from current)"
      },
      thinks_goal_met: {
        type: "boolean",
        description: "True if you think you got the needed information"
      },
      wants_to_close_now: {
        type: "boolean",
        description: "True if conversation feels complete"
      }
    },
    required: ["target_slot_id", "caller_question_detected", "should_reprompt", "thinks_goal_met", "wants_to_close_now"]
  }
}
```

**AI Instructions** (Flexible Mode, line ~5360+):
```
7. After speaking, call report_turn_result with your analysis:
   - target_slot_id: the slot you're currently asking about
   - caller_question_detected: true if caller asked a question instead of answering
   - should_reprompt: true if you think you need to ask again
   - thinks_goal_met: true if you think you got the info needed
   - wants_to_close_now: true if conversation feels complete
```

**Server Processing** (`server.js` line ~7380+):
1. Parse arguments from tool call
2. Validate `target_slot_id` against scenario slots
3. Store in `callState.lastTurnResult` and append to `callState.turnResults[]`
4. Cap history at 20 entries
5. If `caller_question_detected` && current slot incomplete && utterance short/invalid:
   - Set `callState.validationFailedUnrelated = true`
   - Next turn will acknowledge question and return to target
6. Log `[TURN_RESULT]` with slot, question status, reprompt, close flags

**Data Structure**:
```javascript
callState.lastTurnResult = {
  timestamp: 1234567890,
  targetSlotId: "birthdate",
  callerQuestionDetected: true,
  callerQuestionSummary: "Asked about appointment availability",
  extracted: null,
  confidence: null,
  shouldReprompt: true,
  repromptReason: "Caller asked question instead of answering",
  suggestedNextSlotId: null,
  thinksGoalMet: false,
  wantsToCloseNow: false
};

callState.turnResults = [ /* array of turn results, max 20 */ ];
```

**Key Points**:
- **Does NOT** mark checklist complete (only `mark_checklist_item_complete` does that)
- **Only required in flexible mode** (backward compatible)
- **Provides observability** into AI's understanding each turn
- **Enables smarter validation** by detecting caller questions vs answers

**Missing Turn Detection** (line ~7600+):
```javascript
if (!sawTurnResultToolCall && useFlexible && !callState.needsClosing) {
  console.log(nowIso(), "[TURN_RESULT_MISSING] AI did not call report_turn_result");
}
```

---

### AI-Assisted Slot Extraction (Flexible Mode Only)

**Purpose**: Use AI to intelligently extract slot values from caller utterances while maintaining server-side validation and control

**When Used**: Flexible mode + server validation mode (not trust_ai)

**How It Works**:

1. **Extraction Function** (`extractSlotFromUtterance()` at line ~4740+):
   - Lightweight OpenAI API call (text-only, no audio)
   - Uses `gpt-4o-mini` model with JSON-only output
   - Analyzes caller utterance in context of:
     - Current target slot requirement
     - Validation rules from slotSpec.validatorHint
     - Previously collected information
     - Scenario role and goal

2. **Extraction Response**:
   ```javascript
   {
     value: "extracted slot value or null",
     confidence: "low" | "medium" | "high",
     callerQuestionDetected: true | false,
     callerQuestionSummary: "brief summary if question"
   }
   ```

3. **Auto-Completion Flow** (line ~7180+):
   ```
   Caller speaks → Transcription → AI Extraction
   
   If confidence >= medium AND validateCallerResponse passes:
     ✅ Mark slot complete
     ✅ Store extracted value
     ✅ Clear retry flags
     ✅ Log [AUTO_SLOT_COMPLETE_AI]
   
   Else:
     ❌ Set validationFailedFor
     ❌ Set validationFailedUnrelated if question detected
     ❌ Increment retry count
     ❌ Log [AUTO_SLOT_FAIL_AI]
     Next turn gets reprompt instructions
   ```

4. **Safeguards**:
   - **Order enforcement**: Only extracts currentTarget slot
   - **Deduplication**: Hash-based to prevent double-extraction per utterance
   - **Double-complete prevention**: Checks if slot already done by `mark_checklist_item_complete`
   - **Fallback**: Uses basic `validateCallerResponse` if extraction fails
   - **Confidence threshold**: Requires medium or high confidence + validation pass

5. **Benefits**:
   - **Better extraction**: AI understands implicit values ("tomorrow" → specific date)
   - **Caller question detection**: Distinguishes questions from answers
   - **Confidence scoring**: Server knows when to retry vs accept
   - **Natural conversation**: Handles variations without strict pattern matching
   - **Server authority maintained**: All completions validated and enforced by server

**Example**:
```
Caller: "I'd like to come in next Tuesday"
Extraction: { value: "2026-03-03", confidence: "high", callerQuestionDetected: false }
Validation: ✅ Passes date validation
Result: Slot marked complete with extracted date

Caller: "What times do you have available?"
Extraction: { value: null, confidence: "low", callerQuestionDetected: true, callerQuestionSummary: "asking about available times" }
Validation: ❌ Fails (no value provided)
Result: validationFailedUnrelated = true, next turn answers question then reprompts
```

**Logging**:
- `[EXTRACTION]`: Extraction attempt details (slot, value, confidence, question detected)
- `[AUTO_SLOT_COMPLETE_AI]`: Successful extraction and validation
- `[AUTO_SLOT_FAIL_AI]`: Failed extraction or validation with retry count
- `[AUTO_COMPLETE_FALLBACK]`: Extraction error, used basic validation

**Key Points**:
- **Only in flexible mode**: Exact mode uses basic validation only
- **Preserves mark_checklist_item_complete**: Tool calls still work normally
- **Async extraction**: Non-blocking to prevent delays
- **Rate limited**: One extraction per utterance via hash deduplication

---

### Flexible Slot Ordering (Flexible Mode Only)

**Purpose**: Allow natural conversation flow where slot collection order can adapt based on caller context, while maintaining server-enforced gating and safety rules

**When Used**: Flexible mode only (exact mode preserves strict sequential order)

**How It Works**:

#### Gating and Priority Schema

Each `slotSpec` supports two optional fields:

1. **`gating`** (boolean, default: `false`)
   - If `true`, the slot MUST be completed before any non-gating slot
   - Multiple gating slots are asked in `scenario.slots` order
   - Use for critical identification or verification steps

2. **`priority`** (number, default: `100`)
   - Lower number = asked sooner among non-gating slots
   - Only applies after ALL gating slots are complete
   - Tie-breaker: `scenario.slots` array order

**Example**:
```javascript
slotSpecs: {
  call_purpose: {
    promptIntent: "Ask why they're calling",
    requirement: "confirmation they want an appointment",
    gating: true,      // Must be completed first
    priority: 1
  },
  new_or_returning_patient: {
    promptIntent: "Ask if new or returning patient",
    requirement: "new or returning status",
    gating: true,      // Must be completed second
    priority: 2
  },
  birthdate: {
    promptIntent: "Ask for date of birth",
    requirement: "complete date of birth",
    gating: false,     // Can be asked after gating slots
    priority: 10       // Higher priority (asked sooner)
  },
  insurance: {
    promptIntent: "Ask about insurance",
    requirement: "insurance info or self-pay",
    gating: false,
    priority: 50       // Lower priority (asked later)
  }
}
```

#### Server Selection Logic

The server determines the next slot using these helpers:

1. **`getRemainingSlotIds(callState, scenarioNormalized)`** (line ~6268+):
   - Returns all uncompleted required slots in `scenario.slots` order

2. **`getAllowedNextSlotIds(callState, scenarioNormalized)`** (line ~6312+):
   - If any gating slots remain → returns only remaining gating slots (in order)
   - Otherwise → returns all remaining slots (regardless of priority)
   - Gating enforcement happens here

3. **`getNextTurnSpec(callState, scenario)`** (line ~6342+):
   - Gets allowed slots via `getAllowedNextSlotIds()`
   - Checks if AI suggested a next slot via `report_turn_result`
   - If suggestion is in allowed list → accepts it
   - Otherwise → sorts allowed slots by priority (ascending), tie-break by order
   - Returns spec for the chosen slot

#### AI Suggestions

The AI can suggest the next slot after successfully collecting current slot:

**AI Instructions** (Flexible Mode, line ~5440+):
```
ALLOWED NEXT SLOTS (after current is complete): birthdate, patient_name, reason_for_appointment, ...

7. After speaking, call report_turn_result with your analysis:
   - suggested_next_slot_id: (OPTIONAL) suggest next slot ONLY if current successfully complete 
     and suggestion from allowed list above
```

**Server Processing**:
- AI calls `report_turn_result(suggested_next_slot_id='insurance')`
- Server checks if `'insurance'` is in allowed list
- If yes → accepts suggestion, logs `[AI_SUGGESTED_SLOT]`
- If no → rejects, logs `[NEXT_SLOT_REJECT]` with reason:
  - `gating_required`: Gating slots still remain
  - `not_allowed`: Slot not in scenario or already done

#### Priority Sorting

When no valid AI suggestion or auto-selecting next slot:

```javascript
// Sort allowed slots by priority (ascending), then by scenario.slots order
const sortedAllowed = allowedSlots.slice().sort((a, b) => {
  const priorityA = slotSpecs[a].priority || 100;
  const priorityB = slotSpecs[b].priority || 100;
  
  if (priorityA !== priorityB) {
    return priorityA - priorityB;  // Lower priority first
  }
  
  // Tie-break by scenario.slots order
  return scenario.slots.indexOf(a) - scenario.slots.indexOf(b);
});

nextSlotId = sortedAllowed[0];
```

#### Legacy Scenario Support

Scenarios without `gating` or `priority` get defaults via `normalizeScenarioConfig()`:

```javascript
// If slotSpecs exist but lack gating/priority
for (const slotId in scenario.slotSpecs) {
  slotSpecs[slotId] = {
    ...scenario.slotSpecs[slotId],
    gating: scenario.slotSpecs[slotId].gating !== undefined 
      ? scenario.slotSpecs[slotId].gating 
      : false,
    priority: scenario.slotSpecs[slotId].priority !== undefined 
      ? scenario.slotSpecs[slotId].priority 
      : 100
  };
}

// If only questions format (legacy)
for (const slotId of scenario.slots) {
  slotSpecs[slotId] = {
    promptIntent: '...',
    requirement: '...',
    gating: false,    // Default: no gating
    priority: 100     // Default: neutral priority
  };
}
```

**Result**: All scenarios work with flexible ordering, preserving backward compatibility

#### Benefits

1. **Natural conversation flow**: Caller can provide info in any order after gating
2. **Context-aware ordering**: AI suggests next slot based on conversation context
3. **Safety maintained**: Gating slots enforce critical steps first
4. **Server authority**: Server strictly enforces allowed slots, rejects invalid suggestions
5. **Backward compatible**: Legacy scenarios work unchanged (no gating, equal priority)

**Use Cases**:
- **Gating slots**: Identity verification, call purpose confirmation
- **High priority**: Urgency assessment, critical info
- **Low priority**: Optional fields, closing questions

**Logging**:
- `[AI_SUGGESTED_SLOT]`: AI suggestion accepted (shows suggested slot and allowed list)
- `[NEXT_SLOT_REJECT]`: AI suggestion rejected (shows reason: gating_required or not_allowed)

**Constraints**:
- **Flexible mode only**: Exact mode ignores gating/priority, uses strict `scenario.slots` order
- **No new dependencies**: Uses existing OpenAI Realtime `report_turn_result` tool
- **Server authoritative**: AI suggests, server decides

---

## 11. Extension Points

### Adding a New Scenario

1. Create `/scenarios/your_scenario.js`:
   ```javascript
   module.exports = {
     tag: "your_scenario",
     displayName: "Your Scenario Name",
     practiceLabel: "calling [business] to [purpose]",
     answererRole: "staff member at [business]",
     goalStatement: "Collect required information.",
     validation: { mode: "server" },
     slots: ["field1", "field2"],
     questions: {
       field1: {
         baseQuestion: "What is [field1]?",
         validation: {
           requirement: "the [field1]",
           rule: { type: "min_length", minLength: 3 }
         },
         helpIfStuck: "Please provide [field1]."
       }
     },
     closingMessage: "Thanks!"
   };
   ```

2. Register in `scenarios/index.js`:
   ```javascript
   module.exports = {
     doctor_default: require("./doctor_default"),
     pizza_order: require("./pizza_order"),
     your_scenario: require("./your_scenario")
   };
   ```

3. Make available in scenario picker (TwiML flow or opener phase)

**NEW: Creating Flexible Mode Scenarios**

Use `slotSpecs` for natural conversation:

```javascript
module.exports = {
  tag: "your_flexible_scenario",
  displayName: "Your Scenario Name",
  validation: { mode: "server" },
  slots: ["field1", "field2"],
  
  slotSpecs: {
    field1: {
      slotId: "field1",
      promptIntent: "Greet caller and ask about [field1]",
      requirement: "a clear [field1]",
      validatorHint: {
        type: "all_of",
        rules: [
          { type: "min_words", minWords: 3 },
          { type: "keywords_any", keywords: ["keyword1", "keyword2"] }
        ]
      },
      repromptHelp: "Could you clarify what [field1] you need?"
    },
    field2: {
      slotId: "field2",
      promptIntent: "Ask for [field2]",
      requirement: "a complete [field2]",
      validatorHint: { type: "date" },
      repromptHelp: "Please provide [field2] in any format."
    }
  },
  
  // Optional: Include questions format for exact mode fallback
  questions: {
    field1: {
      baseQuestion: "What [field1] do you need?",
      validation: {
        requirement: "a clear [field1]",
        rule: { type: "min_length", minLength: 3 }
      }
    }
  },
  
  closingMessage: "Thanks!"
};
```

### Adding Custom Validation Rules

Extend `validateCallerResponse()` at line ~4760:

```javascript
if (rule.type === "your_custom_type") {
  // Your validation logic
  return customValidationFunction(u);
}
```

---

## Summary

The roleplay phase implements a **dual-mode, config-driven conversation architecture**:

### Core Architecture

1. **Scenario config** defines questions, order, and validation
2. **Server enforces** slot order and validation rules deterministically
3. **Dual conversation modes**:
   - **Exact mode**: AI speaks verbatim `baseQuestion` (legacy, reliable)
   - **Flexible mode**: AI converses naturally while targeting slots (new, conversational)
4. **Enhanced validation** with priority system and new rule types
5. **Structured turn reporting** provides observability into AI's understanding
6. **Checklist tracking** monitors progress through all required fields
7. **Automatic completion** triggers closing message and coaching transition

### Key Features

**Backward Compatibility**
- Legacy `questions` format fully supported
- Scenarios auto-normalized to `slotSpecs` internally
- Mode selection based on scenario format

**Flexible Asking Mode**
- Natural conversation while maintaining server control
- AI can answer caller questions briefly (1-2 sentences)
- Validation remains server-side and deterministic
- `report_turn_result` tool provides turn-level metadata
- Turn result-driven reprompts use AI's `reprompt_reason` for better clarification
- AI can suggest next slot while server maintains final authority

**AI-Assisted Slot Extraction (Flexible Mode)**
- Lightweight OpenAI extraction analyzes caller utterances
- Returns extracted value + confidence rating + question detection
- Auto-completes slots when confidence ≥ medium AND validation passes
- Maintains server authority for all slot completions and order
- Deduplication prevents double-extraction per utterance
- Fallback to basic validation if extraction fails

**Enhanced Validation**
- Priority: `validatorHint` > `validation.rule` > `validation`
- New rule types: `min_words`, `keywords_any`, `not_a_question`, `all_of`
- Improved deflection detection
- Automatic short utterance rejection (≤2 words)
- Caller question detection with smart retry handling
- AI extraction provides better understanding of implicit values

**Observability**
- Turn result history (last 20 turns)
- Caller question detection (via report_turn_result and extraction)
- AI confidence and reprompt signals
- Extraction logs show value, confidence, question detection
- Multi-question detection warns when AI asks >1 question
- Slot ordering logs show AI suggestions accepted/rejected
- Structured logging for debugging

**Flexible Slot Ordering (Flexible Mode)**
- **Gating slots**: Must be completed before non-gating slots (e.g., identity verification)
- **Priority-based selection**: Lower priority number = asked sooner among non-gating slots
- **AI-suggested ordering**: AI can suggest next slot based on conversation context
- **Server enforcement**: Server validates suggestions against gating rules and allowed slots
- **Legacy compatibility**: Scenarios without gating/priority default to sequential order

**Deterministic Closing Gate (Flexible Mode)**
- **State machine**: `collecting` → `closing_pending` → `closing_delivered`
- **Reliable triggering**: Server sets `closing_pending` when `allDone` is true
- **Multiple paths to completion**: Via `report_turn_result`, `mark_checklist_item_complete`, or fail-safe auto-mark
- **Key phrases support**: Optional `scenario.closingKeyPhrases` array guides natural closing
- **Fail-safe**: If AI speaks closing but forgets tools, server auto-marks deterministically
- **Gate enforcement**: Coaching only transitions when `roleplayGate === "closing_delivered"`
- **Natural closing**: AI paraphrases while respecting key idea and optional key phrases

This architecture ensures **consistent, high-quality practice sessions** with natural conversations, while maintainers can easily add scenarios without touching core logic. The dual-mode approach provides flexibility for different practice needs while maintaining deterministic control.
