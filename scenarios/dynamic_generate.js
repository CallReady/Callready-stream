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

Rules:
- Output ONLY valid JSON, no commentary
- Use tag: "dynamic_${callSid}"
- Include 4-9 required slots PLUS a final "questions" slot (5-10 total slots)
- The LAST slot must ALWAYS be "questions" for asking the caller if they have any questions
- Each slot must have a question definition with baseQuestion and optional helpIfStuck
- baseQuestion: 5-160 chars, natural spoken question
- Never include placeholders like {{TOTAL}} or [generate something]
- answererRole: who the AI plays (e.g., "receptionist", "customer service rep")
- practiceLabel: what the caller is practicing (e.g., "calling a veterinary clinic to schedule an appointment")
- goalStatement: 1-2 sentences describing success
- closingMessage: brief thank you message
- The "questions" slot must have loopUntilDone: true

Example structure:
{
  "tag": "dynamic_CA123",
  "displayName": "Vet Appointment",
  "practiceLabel": "calling a veterinary clinic to schedule an appointment",
  "answererRole": "veterinary receptionist",
  "goalStatement": "Successfully schedule a vet appointment by providing all required information.",
  "slots": ["pet_name", "pet_type", "reason", "owner_name", "phone_number", "preferred_date", "questions"],
  "questions": {
    "pet_name": {
      "baseQuestion": "What's your pet's name?",
      "helpIfStuck": "I need the name of the pet you're bringing in.",
      "validation": {
        "requirement": "pet's name"
      }
    },
    "pet_type": {
      "baseQuestion": "What kind of animal is your pet?",
      "helpIfStuck": "Is it a dog, cat, or another type of animal?",
      "validation": {
        "requirement": "type of animal"
      }
    },
    "reason": {
      "baseQuestion": "What's the reason for the visit?",
      "helpIfStuck": "Are they sick, needing a checkup, or something else?",
      "validation": {
        "requirement": "reason for appointment"
      }
    },
    "owner_name": {
      "baseQuestion": "Can I get your full name?",
      "helpIfStuck": "I need the pet owner's name for the appointment.",
      "validation": {
        "requirement": "full name"
      }
    },
    "phone_number": {
      "baseQuestion": "What's the best phone number to reach you?",
      "helpIfStuck": "I need a phone number in case we need to contact you.",
      "validation": {
        "requirement": "valid phone number with at least 7 digits"
      }
    },
    "preferred_date": {
      "baseQuestion": "What day works best for you?",
      "helpIfStuck": "When would you like to bring your pet in?",
      "validation": {
        "requirement": "preferred appointment date"
      }
    },
    "questions": {
      "baseQuestion": "Do you have any questions for me?",
      "loopUntilDone": true,
      "helpIfStuck": "I can answer any questions you might have.",
      "validation": {
        "requirement": "confirmation they have no more questions"
      }
    }
  },
  "closingMessage": "Thank you! We'll see you and your pet soon."
}

Now generate a scenario based on the user's request.`;

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
