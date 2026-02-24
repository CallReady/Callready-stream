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
- Include 3-10 total slots with "call_purpose" as FIRST and "questions" as LAST
- The FIRST slot must ALWAYS be "call_purpose" with a proper greeting
- The LAST slot must ALWAYS be "questions" for asking if they have any questions
- Between call_purpose and questions, include 1-8 relevant fields for the scenario
- Create a realistic business name that fits the scenario context
- answererRole must include the business name and staff role (e.g., "front desk staff at BodyBuilders Gym")
- The call_purpose baseQuestion must be a natural greeting: "Thanks for calling [Business Name]. This is [Staff Name]. How can I help you?"
- All other questions should follow naturally in conversation order
- Never include placeholders like {{TOTAL}} or [generate something]
- practiceLabel: what the caller is practicing (e.g., "calling a gym to cancel a membership")
- goalStatement: 1-2 sentences describing success
- closingMessage: brief, context-appropriate thank you message
- The "questions" slot must have loopUntilDone: true

IMPORTANT CONTEXT AWARENESS:
- Understand what the user wants to practice (e.g., canceling, scheduling, ordering, etc.)
- Choose appropriate fields to collect based on the call type
- For cancellations: get member/account info, reason, confirmation
- For appointments: get name, contact, reason, date/time preference
- For orders: get items, delivery/pickup, contact, payment
- Make the staff name realistic (use common first names appropriate to the business type)
- Make the business name creative and realistic for the industry

Example for "calling a gym to cancel membership":
{
  "tag": "dynamic_CA123",
  "displayName": "Cancel Gym Membership",
  "practiceLabel": "calling a gym to cancel a membership",
  "answererRole": "customer service representative at FitLife Gym",
  "goalStatement": "Successfully cancel a gym membership by providing required information and completing the cancellation process.",
  "slots": ["call_purpose", "member_name", "membership_number", "reason_for_cancellation", "confirmation", "questions"],
  "questions": {
    "call_purpose": {
      "baseQuestion": "Thanks for calling FitLife Gym. This is Sarah. How can I help you today?",
      "waitForResponse": true,
      "validation": {
        "requirement": "confirmation they want to cancel their membership"
      },
      "helpIfStuck": "If unclear, try: 'Are you calling about your membership?'"
    },
    "member_name": {
      "baseQuestion": "Can I get your full name please?",
      "helpIfStuck": "I need the name on the membership account.",
      "validation": {
        "requirement": "full name"
      }
    },
    "membership_number": {
      "baseQuestion": "What's your membership number or the phone number on your account?",
      "helpIfStuck": "I can look you up by your membership ID or phone number.",
      "validation": {
        "requirement": "membership number or phone number"
      }
    },
    "reason_for_cancellation": {
      "baseQuestion": "I see. May I ask why you'd like to cancel?",
      "helpIfStuck": "Understanding the reason helps us improve our services.",
      "validation": {
        "requirement": "reason for cancellation"
      }
    },
    "confirmation": {
      "baseQuestion": "Just to confirm, you'd like to cancel your membership effective immediately. Is that correct?",
      "helpIfStuck": "I need you to confirm the cancellation.",
      "validation": {
        "requirement": "confirmation of cancellation"
      }
    },
    "questions": {
      "baseQuestion": "Do you have any questions about the cancellation or your final bill?",
      "loopUntilDone": true,
      "helpIfStuck": "I'm happy to answer any questions before we finalize this.",
      "validation": {
        "requirement": "confirmation they have no more questions"
      }
    }
  },
  "closingMessage": "Thank you for being a member. Have a great day!"
}

Now generate a scenario based on the user's request. Be creative with business names, make them realistic and appropriate. Use natural conversational questions.`;

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
