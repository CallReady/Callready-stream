// Dynamic scenario generation using OpenAI with safety checks

const { validateAndNormalizeScenario } = require('./dynamic_validate');
const SLOTS = require('./slot_library');

// Safety: reject requests containing dangerous keywords
const UNSAFE_KEYWORDS = [
  'suicide', 'kill myself', 'self harm', 'overdose', 'end my life',
  'weapon', 'gun', 'knife', 'bomb', 'terrorist',
  'rape', 'sexual assault', 'child abuse', 'exploitation',
  'illegal drug', 'cocaine', 'heroin', 'meth', 'fentanyl'
];

/**
 * Check if prompt contains unsafe content
 * @param {string} promptText - The user's generation request
 * @returns {boolean} True if unsafe content detected
 */
function containsUnsafeContent(promptText) {
  const lower = promptText.toLowerCase();
  return UNSAFE_KEYWORDS.some(keyword => lower.includes(keyword));
}

/**
 * Generate a dynamic scenario using OpenAI
 * @param {object} options
 * @param {string} options.promptText - User's description of desired scenario
 * @param {string} options.callSid - Twilio CallSid for tagging
 * @param {string} options.openaiApiKey - OpenAI API key
 * @returns {Promise<{ok: boolean, scenario?: object, error?: string}>}
 */
async function generateDynamicScenario({ promptText, callSid, openaiApiKey }) {
  // Safety check
  if (containsUnsafeContent(promptText)) {
    return { ok: false, error: "unsafe_request" };
  }

  // Validate inputs
  if (!promptText || typeof promptText !== "string" || promptText.trim().length < 10) {
    return { ok: false, error: "invalid_prompt" };
  }

  if (!callSid || typeof callSid !== "string") {
    return { ok: false, error: "invalid_call_sid" };
  }

  if (!openaiApiKey || typeof openaiApiKey !== "string") {
    return { ok: false, error: "missing_api_key" };
  }

  const slotMenu = Object.entries(SLOTS).map(([name, slot]) => {
    return `${name}: { promptIntent: "${slot.promptIntent}", requirement: "${slot.requirement}", gating: ${slot.gating}, priority: ${slot.priority}, complication: ${slot.complication} }`;
  }).join('\n');

  const systemPrompt = `You are a scenario config generator for a phone call roleplay practice system called CallReady. Your job is to generate realistic, well-structured call scenarios that help anxious callers practice real-world phone calls.

STEP 1 — CLASSIFY THE CALL TYPE:
Before choosing any slots, classify the call into one of these categories:
- PERSONAL: calling family, friends, neighbors. No verification slots. Casual tone. No business structure.
- INFORMATIONAL: calling to ask a quick question like hours, directions, pricing, availability. 2-3 slots max. Answer and close.
- TRANSACTIONAL: placing an order, making a reservation, booking a service. Collect what is needed to complete the task.
- ACCOUNT_SERVICE: cancellations, disputes, billing issues, changes to an account. Identity verification required, then the task.
- MEDICAL_PROFESSIONAL: doctor, dentist, therapist, pharmacy. Verification plus scheduling or information.

STEP 2 — SELECT SLOTS FROM THE LIBRARY:
Here is the full slot library. Select appropriate slots for the call type and category. You may also invent new slots if nothing in the library fits — but prefer library slots where possible.

${slotMenu}

SLOT SELECTION RULES BY CATEGORY:
- PERSONAL: no verification slots, no business greeting, use a person's name not a business name. Use only as many slots as the conversation realistically needs — simple calls may only need 2.
- INFORMATIONAL: call_purpose, then an information_provided slot where the answerer gives the caller what they asked for and confirms they have what they need, then questions. Always include information_provided for informational calls — never go directly from call_purpose to questions.
- TRANSACTIONAL: call_purpose, relevant item/order slots, contact info, confirmation, questions. Use only slots the transaction actually requires.
- ACCOUNT_SERVICE: call_purpose, identity verification slots, task-specific slots, at least one complication slot, questions.
- MEDICAL_PROFESSIONAL: call_purpose, identity/verification slots, scheduling slots, questions.
- ALL CATEGORIES: Never include a slot called "closing" — the engine handles the closing automatically. Including it will break the call.

COMPLICATION RULES:
- ACCOUNT_SERVICE calls must include at least one complication slot (SLOT_RETENTION_OFFER_RESPONSE, SLOT_HOLD_ACKNOWLEDGMENT, SLOT_POLICY_PUSHBACK_RESPONSE, or SLOT_UNEXPECTED_NEWS_RESPONSE)
- MEDICAL_PROFESSIONAL calls should include at least one complication slot
- TRANSACTIONAL calls may include one complication slot if realistic
- PERSONAL and INFORMATIONAL calls should NOT include complication slots

STEP 3 — BUILD THE SCENARIO CONFIG:
Output ONLY valid JSON with these rules:
- tag: "dynamic_${callSid}"
- displayName: short human-readable name (e.g. "Cancel Gym Membership")
- callCategory: the category you assigned in Step 1 (e.g. "ACCOUNT_SERVICE")
- roleplayMode: "flex"
- validation: { "mode": "trust_ai" }
- completion: { "mode": "all_required_slots_complete" }
- practiceLabel: what the caller is practicing (e.g. "calling a gym to cancel a membership")
- answererRole: for business calls, include the business name and staff role. For personal calls, use a natural description like "Brad's grandmother Margaret"
- goalStatement: 1-2 sentences describing what success looks like
- closingMessage: a brief, warm, in-character closing line appropriate to the call type
- slots: array of slot ids in order, always starting with "call_purpose" and ending with "questions"
- slotSpecs: an entry for every slot in the slots array

SLOTSPECS REQUIREMENTS:
Every slot must include ALL of these fields:
- promptIntent: what the AI should elicit (brief phrase)
- answererGreeting: null for all slots except call_purpose, where it is the literal spoken opening line
- requirement: what counts as a valid answer
- validatorHint: { "type": "min_words", "minWords": 2 } for most slots, { "type": "name" } for name slots, { "type": "keywords_any", ... } where specific words are expected
- repromptHelp: null or a brief hint for the AI if the caller is stuck
- helpIfStuck: null or additional guidance
- examplesGood: null or array of example good responses
- examplesBad: null
- followups: null or array of { when, ask } objects
- loopUntilDone: false for all slots except "questions" where it is true
- loopPromptIntent: null for all slots except "questions"
- loopDoneHint: null for all slots except "questions"
- gating: true for call_purpose and identity/verification slots, false for all others
- priority: sequential numbers starting at 1
- complication: true for complication slots, false for all others
- complicationNote: null for non-complication slots, brief description for complication slots

The call_purpose slot answererGreeting is REQUIRED and must never be null. It must be:
- For business calls: a natural spoken greeting with the business name and a staff name, e.g. "Thanks for calling FitLife Gym, this is Jordan, how can I help you today?"
- For personal calls: a natural way a person would answer the phone, e.g. "Hello?" or "Hey, who's this?"
- For informational calls: same as business calls — always include a business name and staff name
- NEVER set answererGreeting to null on the call_purpose slot. If you do not have a business name, invent a realistic one.

The "questions" slot must always have:
- loopUntilDone: true
- loopPromptIntent: "Ask if they have any other questions."
- loopDoneHint: { "type": "keywords_any", "keywords": ["no", "nope", "that's all", "nothing", "i'm good", "thats it", "all set", "no thanks"], "minMatches": 1 }

IMPORTANT: Output ONLY the JSON object. No commentary, no markdown, no code fences.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptText }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      return { ok: false, error: "openai_api_error" };
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected OpenAI response structure:', data);
      return { ok: false, error: "invalid_openai_response" };
    }

    const content = data.choices[0].message.content.trim();
    
    // Parse JSON response
    let rawScenario;
    try {
      rawScenario = JSON.parse(content);
    } catch (parseErr) {
      console.error('Failed to parse OpenAI JSON response:', parseErr.message);
      console.error('Response content:', content);
      return { ok: false, error: "invalid_json_from_ai" };
    }

    // Ensure the tag matches the expected format
    rawScenario.tag = `dynamic_${callSid}`;

    // Validate and normalize
    try {
      const validatedScenario = validateAndNormalizeScenario(rawScenario);
      return { ok: true, scenario: validatedScenario };
    } catch (validationErr) {
      console.error('Scenario validation failed:', validationErr.message);
      return { ok: false, error: "validation_failed", details: validationErr.message };
    }

  } catch (err) {
    console.error('Error generating dynamic scenario:', err);
    return { ok: false, error: "generation_error", details: err.message };
  }
}

module.exports = {
  generateDynamicScenario,
  containsUnsafeContent
};
