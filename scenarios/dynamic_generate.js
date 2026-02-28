// Dynamic scenario generation using OpenAI with safety checks

const { validateAndNormalizeScenario } = require('./dynamic_validate');

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

  const systemPrompt = `You are a scenario config generator for a roleplay practice system.

Generate a valid scenario configuration object based on the user's request.

CRITICAL REQUIREMENTS:
- Output ONLY valid JSON, no commentary
- Use tag: "dynamic_${callSid}"
- Include displayName: a short human-readable name for the scenario (e.g., "Cancel Gym Membership")
- Include roleplayMode: "flex" at the top level
- Include validation: { "mode": "trust_ai" } at the top level
- Include completion: { "mode": "all_required_slots_complete" } at the top level
- Include 3-10 total slots with "call_purpose" as FIRST and "questions" as LAST
- The FIRST slot must ALWAYS be "call_purpose"
- The LAST slot must ALWAYS be "questions" for asking if they have any questions
- Between call_purpose and questions, include 1-8 relevant fields for the scenario
- Create a realistic business name that fits the scenario context
- answererRole must include the business name and staff role (e.g., "front desk staff at BodyBuilders Gym")
- Never include placeholders like {{TOTAL}} or [generate something]
- practiceLabel: what the caller is practicing (e.g., "calling a gym to cancel a membership")
- goalStatement: 1-2 sentences describing success
- closingMessage: REQUIRED - A brief, warm, professional closing from the business staff that wraps up the call
  * For cancellations: "Thank you for being a member. Have a great day!"
  * For appointments: "We'll see you on [day]. Have a great day!"
  * For orders: "Your order is confirmed. Thanks for calling!"
  * Must sound natural and in-character for the business type
- Include a slotSpecs object with an entry for every slot in the slots array
- Do NOT include a questions object - flex mode does not use it

SLOTSPECS REQUIREMENTS:
Every slot in slotSpecs must include:
- promptIntent: what the AI should elicit from the caller (a brief phrase)
- requirement: what counts as a valid answer (a brief phrase)
- validatorHint: a rule object for validating the caller's response
  * For name slots: { "type": "name" }
  * For most other slots: { "type": "min_words", "minWords": 2 }
- gating: true for call_purpose and any account or identity slots (name, account number, membership ID, etc.), false for all others
- priority: sequential numbers starting at 1 (lower = asked sooner)

The call_purpose slot's promptIntent should produce a natural greeting from the staff member, e.g. "Thanks for calling [Business Name]. This is [Staff Name]. How can I help you?"

The "questions" slot must additionally include:
- loopUntilDone: true
- loopPromptIntent: "Ask if they have any other questions."
- loopDoneHint: { "type": "keywords_any", "keywords": ["no", "nope", "that's all", "nothing", "i'm good", "thats it"], "minMatches": 1 }

IMPORTANT CONTEXT AWARENESS:
- Understand what the user wants to practice (e.g., canceling, scheduling, ordering, etc.)
- Choose appropriate fields to collect based on the call type
- For cancellations: get member/account info, reason, confirmation
- For appointments: get name, contact, reason, date/time preference
- For orders: get items, delivery/pickup, contact, payment
- Make the staff name realistic (use common female first names appropriate to the business type)
- Make the business name creative and realistic for the industry

Example for "calling a gym to cancel membership":
{
  "tag": "dynamic_CA123",
  "displayName": "Cancel Gym Membership",
  "roleplayMode": "flex",
  "validation": { "mode": "trust_ai" },
  "completion": { "mode": "all_required_slots_complete" },
  "practiceLabel": "calling a gym to cancel a membership",
  "answererRole": "customer service representative at FitLife Gym",
  "goalStatement": "Successfully cancel a gym membership by providing required information and completing the cancellation process.",
  "slots": ["call_purpose", "member_name", "membership_number", "reason_for_cancellation", "confirmation", "questions"],
  "slotSpecs": {
    "call_purpose": {
      "promptIntent": "Greet the caller and find out why they are calling",
      "requirement": "confirmation they want to cancel their membership",
      "validatorHint": { "type": "min_words", "minWords": 2 },
      "gating": true,
      "priority": 1
    },
    "member_name": {
      "promptIntent": "Ask for the full name on the membership account",
      "requirement": "a full first and last name",
      "validatorHint": { "type": "name" },
      "gating": true,
      "priority": 2
    },
    "membership_number": {
      "promptIntent": "Ask for their membership number or account phone number",
      "requirement": "a membership ID or phone number",
      "validatorHint": { "type": "min_words", "minWords": 1 },
      "gating": true,
      "priority": 3
    },
    "reason_for_cancellation": {
      "promptIntent": "Ask why they want to cancel",
      "requirement": "a brief reason for cancellation",
      "validatorHint": { "type": "min_words", "minWords": 2 },
      "gating": false,
      "priority": 4
    },
    "confirmation": {
      "promptIntent": "Ask them to confirm they want to proceed with the cancellation",
      "requirement": "verbal confirmation they want to proceed",
      "validatorHint": { "type": "min_words", "minWords": 1 },
      "gating": false,
      "priority": 5
    },
    "questions": {
      "promptIntent": "Ask if they have any questions before closing",
      "requirement": "confirmation they have no more questions",
      "validatorHint": { "type": "keywords_any", "keywords": ["no", "nope", "that's all", "nothing", "i'm good", "thats it"], "minMatches": 1 },
      "gating": false,
      "loopUntilDone": true,
      "loopPromptIntent": "Ask if they have any other questions.",
      "loopDoneHint": { "type": "keywords_any", "keywords": ["no", "nope", "that's all", "nothing", "i'm good", "thats it"], "minMatches": 1 },
      "priority": 6
    }
  },
  "closingMessage": "Thank you for being a member. Have a great day!"
}

Now generate a scenario based on the user's request. Be creative with business names, make them realistic and appropriate.`;

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
