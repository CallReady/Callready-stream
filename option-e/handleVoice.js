//Stable fallback after adding intro and retry 
const { getOrCreateSession, saveSession, clearSession, getCallSid } = require("./sessionStore");
const WRAPUP_PHASE = "wrapup";
const OPTION_E_QUESTIONS = [
  {
    key: "reason",
    prompt: "In one sentence, what are you calling about today?",
    invalidPrompt: "I did not catch a clear reason. Try again.",
    retryLimit: 3,
    isValid: isValidReasonInput,
  },
  {
    key: "detail",
    prompt: "What is one important detail they might ask you for?",
    invalidPrompt: "I did not catch that. Please say the detail again.",
    retryLimit: 2,
    isValid: isValidDetailInput,
  },
];

const FLOWS = {
  default: ["reason", "detail"],
  quick: ["reason"],

  // v1 flows
  medical: ["reason", "detail"],
  hours: ["reason", "detail"],
};

function buildAskQuestionTwiml(q, actionUrl, timeoutSec, speechTimeoutSec) {
  if (!q) {
    return "<Say>Sorry, something went wrong.</Say><Hangup/>";
  }

  const baseUrl = (process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com").replace(/\/+$/, "");
  const ttsKey = "q_" + String(q.key || "unknown").toLowerCase();
  const playUrl =
    baseUrl +
    "/tts?key=" +
    encodeURIComponent(ttsKey) +
    "&text=" +
    encodeURIComponent(String(q.prompt || ""));

  return (
    "<Play>" +
    escapeXml(playUrl) +
    "</Play>" +
    "<Gather input=\"speech dtmf\" action=\"" +
    escapeXml(actionUrl) +
    "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" +
    escapeXml(String(timeoutSec)) +
    "\" speechTimeout=\"" +
    escapeXml(String(speechTimeoutSec)) +
    "\"></Gather>" +
    "<Redirect method=\"POST\">" +
    escapeXml(actionUrl) +
    "</Redirect>"
  );
}

const PHASES = OPTION_E_QUESTIONS.reduce((acc, q) => {
  if (q && q.key) {
    acc[q.key] = {
      gather: { timeoutSec: 3, speechTimeoutSec: 1 },
      retryLimit: typeof q.retryLimit === "number" ? q.retryLimit : 1,
    };
  }
  return acc;
}, {});

function escapeXml(value) {
  const s = typeof value === "string" ? value : String(value ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeSafeCoachingLine(raw, fallback) {
  const fb = String(fallback || "Try a short, specific answer. You can keep it simple.").trim();

  let t = String(raw || "").replace(/\s+/g, " ").trim();
  if (!t) return fb;

  // Hard length cap, keeps TwiML and audio predictable
  if (t.length > 220) t = t.slice(0, 220).trim();

  // Keep at most two sentences to avoid rambling
  const parts = t.split(/[.!?]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    t = parts.slice(0, 2).join(". ") + ".";
  } else if (parts.length === 2) {
    t = parts[0] + ". " + parts[1] + ".";
  } else if (parts.length === 1) {
    t = parts[0] + ".";
  }

  // Remove any characters that might sound odd in TTS if an AI ever outputs them
  t = t.replace(/[<>]/g, "").trim();
  if (!t) return fb;

  return t;
}

function getCoachingLineForKey(key, helpCount) {
  const coachingByKey = {
    reason: {
      first:
        "Try a simple one sentence reason, for example, I need to schedule an appointment, or I have a question about a symptom.",
      second:
        "Try starting with: I'm calling because I need to. Then add one short detail, for example, I'm calling because I need to schedule a checkup.",
    },
    detail: {
      first:
        "Name one detail they might ask for, for example, your date of birth, your insurance, or your address.",
      second:
        "If you are stuck, pick one of these and say it out loud: My date of birth is. My insurance is. My address is. Choose one and fill in the blank.",
    },
  };

  const perKey = coachingByKey[key] || {};
  if (helpCount >= 2) {
    return perKey.second || "Let us make it easier. Use a starter phrase, then fill in one blank.";
  }
  return perKey.first || "Try a short, specific answer. You can keep it simple.";
}

async function getFillerLine(session) {
  const fallback = "Okay. Give me a second.";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || typeof fetch !== "function") {
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_COACHING_MODEL || "gpt-4o-mini",
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "Return one very short conversational filler line, under 8 words. " +
                  "No coaching. No instructions. No Try saying. " +
                  "Just a brief natural pause line.",
              },
            ],
          },
        ],
        max_output_tokens: 20,
      }),
    });

    clearTimeout(timer);

    if (!resp.ok) return fallback;

    const data = await resp.json();
    let text = data && typeof data.output_text === "string"
      ? data.output_text
      : "";

    text = String(text || "").trim();
    if (!text || text.length > 60) return fallback;

    return text;
  } catch (e) {
    return fallback;
  }
}

async function getWrapupLine(session) {
  const fallback = "Nice work. You can practice again anytime.";
  session.wrapupMeta = session.wrapupMeta || {};
  session.wrapupMeta.source = "fallback";
  session.wrapupMeta.reason = "init";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    session.wrapupMeta.reason = "no_api_key";
    return fallback;
  }

  if (typeof fetch !== "function") {
    session.wrapupMeta.reason = "no_fetch";
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 900);

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_COACHING_MODEL || "gpt-4o-mini",
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "Return one short supportive wrap up line for practice. " +
                  "Under 12 words. No emojis. No quotes. Plain ASCII.",
              },
            ],
          },
        ],
        max_output_tokens: 25,
      }),
    });

    clearTimeout(timer);

    if (!resp.ok) {
      session.wrapupMeta.reason = "http_" + String(resp.status);
      return fallback;
    }

    const data = await resp.json();
    const text = data && typeof data.output_text === "string" ? data.output_text : "";
    const t = String(text || "").trim();

    if (!t || t.length > 80) {
      session.wrapupMeta.reason = "empty_text";
      return fallback;
    }

    session.wrapupMeta.source = "ai";
    session.wrapupMeta.reason = "ok";
    return t;

  } catch (e) {
    const name = e && e.name ? String(e.name) : "";
    if (name === "AbortError") {
      session.wrapupMeta.reason = "timeout";
    } else {
      session.wrapupMeta.reason = "exception";
    }
    return fallback;
  }

}

async function getCoachingLine(key, helpCount, session) {
  // Seam for AI coaching with strict timeout and deterministic fallback.
  const fallback = getCoachingLineForKey(key, helpCount);

  session.coachingMeta = session.coachingMeta || {};
  session.coachingMeta.source = "fallback";
  session.coachingMeta.reason = "init";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    session.coachingMeta.reason = "no_api_key";
    return fallback;
  }

  if (typeof fetch !== "function") {
    session.coachingMeta.reason = "no_fetch";
    return fallback;
  }

  const model = process.env.OPENAI_COACHING_MODEL || "gpt-4o-mini";

  const questionLabel = key === "reason" ? "reason for calling" : "one detail they might ask for";
  const helpLevel = helpCount >= 2 ? "second" : "first";

  const developerText =
    "You are a calm phone call practice coach. " +
    "You are NOT the receptionist. " +
    "Do NOT speak as the clinic. " +
    "Do NOT roleplay. " +
    "Return exactly one short coaching line, no more than 14 words. " +
    "Use only plain ASCII characters. No smart quotes, no special punctuation. " +
    "No greeting. No emojis. No brackets. No quotation marks. " +
    "Start with exactly: Try saying: " +
    "Then provide a first-person starter fragment the student can say right now. " +
    "If the student is answering the reason for calling, give one sentence that starts with: I am calling because I need to " +
    "If the student is answering one detail they might ask for, you MUST output only one of these exact starters and nothing else: " +
    "My date of birth is, My insurance is, My address is, My phone number is. " +
    "Do NOT add any numbers, names, dates, or examples. End immediately after the starter. ";

  const userText =
    "Context: This is a medical clinic call practice. " +
    "The student asked for help while answering the " + questionLabel + ". " +
    "Help request level: " + helpLevel + ". " +
    "Give one coaching line they can immediately say.";

  const timeoutMs = Number(process.env.OPENAI_COACHING_TIMEOUT_MS || 1200);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          { role: "developer", content: [{ type: "input_text", text: developerText }] },
          { role: "user", content: [{ type: "input_text", text: userText }] },
        ],
        max_output_tokens: 60,
      }),
    });

    clearTimeout(timer);

    if (!resp.ok) {
      session.coachingMeta.reason = "http_" + String(resp.status);
      return fallback;
    }

    const data = await resp.json();

    let text = "";
    if (data && typeof data.output_text === "string") {
      text = data.output_text;
    } else if (
      data &&
      Array.isArray(data.output) &&
      data.output[0] &&
      Array.isArray(data.output[0].content) &&
      data.output[0].content[0] &&
      typeof data.output[0].content[0].text === "string"
    ) {
      text = data.output[0].content[0].text;
    }

    text = String(text || "").trim();
    if (!text) {
      session.coachingMeta.reason = "empty_text";
      return fallback;
    }

    session.coachingMeta.source = "ai";
    session.coachingMeta.reason = "ok";
    return text;
  } catch (e) {
    const name = e && e.name ? String(e.name) : "";
    if (name === "AbortError") {
      session.coachingMeta.reason = "timeout";
    } else {
      session.coachingMeta.reason = "exception";
    }
    return fallback;
  }
}

function logPhaseTransition(callSid, fromPhase, toPhase, note) {
  console.log("OptionE transition:", {
    callSid: callSid || "(none)",
    from: fromPhase || "(none)",
    to: toPhase || "(none)",
    note: note || "",
    at: new Date().toISOString(),
  });
}

function isDuplicateNoInputHit(session, phase, hasInput) {
  if (!session) return false;
  if (hasInput) return false;

  const now = Date.now();
  session.lastHit = session.lastHit || {};
  const last = session.lastHit[phase];

  // Consider duplicate if we see the same phase again within 2 seconds with no input.
  if (last && now - last < 2000) {
    return true;
  }

  session.lastHit[phase] = now;
  return false;
}

function stripFillers(text) {
  let t = String(text || "").toLowerCase();

  const fillers = [
    "um",
    "uh",
    "umm",
    "hmm",
    "mm",
    "i dont know",
    "i don't know",
    "idk",
    "nothing",
  ];

  for (const f of fillers) {
    t = t.replace(new RegExp("\\b" + f + "\\b", "g"), "");
  }

  return t.replace(/\s+/g, " ").trim();
}

function isNonsenseSpeechInput(speechText, confidenceValue) {
  const raw = String(speechText || "").trim();
  if (!raw) return true;

  // If Twilio provided a confidence score, use it as a strong signal.
  // Keep threshold conservative to avoid rejecting real answers with imperfect audio.
  const hasConfidence = typeof confidenceValue === "number" && Number.isFinite(confidenceValue);
  const threshold = Number(process.env.OPTION_E_SPEECH_CONFIDENCE_MIN || 0.35);

  if (hasConfidence && confidenceValue < threshold) return true;

  // Normalize for heuristic checks
  const t = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return true;

  // Very short speech results are often clicks, breaths, or partial recognitions
  if (t.length < 2) return true;

  // Repeated single character like "aaa" or "mmm"
  if (/^(.)\1{2,}$/.test(t)) return true;

  // Common non-answers and filler-only
  const stripped = stripFillers(t);
  if (!stripped || stripped.length < 2) return true;

  // Single token that is extremely likely to be filler or noise
  const tokens = stripped.split(" ").filter(Boolean);
  if (tokens.length === 1) {
    const w = tokens[0];
    const badSingles = ["uh", "um", "umm", "hmm", "mm", "m"];
    if (badSingles.includes(w)) return true;
  }

  return false;
}

function isValidReasonInput(text) {
    const t = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Truly empty input
  if (!t) return false;

  // Single character inputs are almost never intentional reasons
  // Very short inputs are usually not intentional,
  // but allow a single digit (DTMF) as a valid short answer.
  if (t.length < 2) {
    if (/^[0-9]$/.test(t)) return true;
    return false;
  }


  // Repeated filler sounds like "ummm", "uhhh", "mmmm"
  if (/^(.)\1{2,}$/.test(t)) return false;

  // Clear non-answers
  const badExact = [
    "uh",
    "um",
    "hmm",
    "mm",
    "idk",
    "i dont know",
    "i don't know",
    "nothing",
    "umm",
  ];

  for (const b of badExact) {
    if (t === b) return false;
  }

    const stripped = stripFillers(t);
  if (!stripped || stripped.length < 2) return false;

  const weakWords = [
    "call",
    "schedule",
    "appointment",
    "check",
    "sick",
    "pain",
    "refill",
    "problem",
    "question",
    "follow",
    "visit",
    "need",
    "want",
  ];

  const hasContentWord = weakWords.some((w) => stripped.includes(w));

  if (hasContentWord) return true;

  const words = stripped.split(" ").filter(Boolean);

  // If they gave 3+ real words, treat it as specific enough even without keywords.
  if (words.length >= 3) return true;

  return false;


}

function isValidDetailInput(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return false;
  // Very short inputs are usually not intentional,
  // but allow a single digit (DTMF) as a valid short answer.
  if (t.length < 2) {
    if (/^[0-9]$/.test(t)) return true;
    return false;
  }

  if (/^(.)\1{2,}$/.test(t)) return false;

  const badExact = [
    "uh",
    "um",
    "hmm",
    "mm",
    "idk",
    "i dont know",
    "i don't know",
    "nothing",
    "umm",
  ];

  for (const b of badExact) {
    if (t === b) return false;
  }
  const stripped = stripFillers(t);
  if (!stripped || stripped.length < 2) return false;

  return true;

}

function isValidAnswerForQuestion(q, text) {
  if (!q) return false;
  if (typeof q.isValid === "function") {
    return q.isValid(text);
  }
  return String(text || "").trim().length > 0;
}

function handleQuestionRetry(res, callSid, session, actionUrl, q, phaseKeyForRetry, gatherCfg, retryLimit) {
  session.retries = session.retries || {};
  session.retries[phaseKeyForRetry] = (session.retries[phaseKeyForRetry] || 0) + 1;
  saveSession(session);

  if ((session.retries && session.retries[phaseKeyForRetry] ? session.retries[phaseKeyForRetry] : 0) >= retryLimit) {
    logCallEnd(callSid, session, phaseKeyForRetry + "_retry_limit_reached");
    if (callSid) clearSession(callSid);

    return sendTwiml(
      res,
      "<Say>No worries. Let us stop here for now, and you can try again anytime.</Say>" +
        "<Hangup/>"
    );
  }

  const retryPoolSize = 9;
  const rand = Math.floor(Math.random() * retryPoolSize) + 1;
  const retryKey = "retry_" + String(rand).padStart(2, "0");

  let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
  while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

  const retryPlay =
    "<Play>" +
    escapeXml(baseUrl + "/tts?key=" + encodeURIComponent(retryKey)) +
    "</Play>";

  return sendTwiml(
    res,
    retryPlay +
      "<Gather input=\"speech dtmf\" action=\"" +
      escapeXml(actionUrl) +
      "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" +
      String(gatherCfg.timeoutSec) +
      "\" speechTimeout=\"" +
      String(gatherCfg.speechTimeoutSec) +
      "\"></Gather>" +
      "<Redirect method=\"POST\">" +
      escapeXml(actionUrl) +
      "</Redirect>"
  );
}
async function handleGenericQuestionPhase(opts) {
  const res = opts.res;
  const callSid = opts.callSid;
  const session = opts.session;
  const actionUrl = opts.actionUrl;

  const phaseKey = opts.phaseKey; // "reason" or "detail"
  const questionIndex = opts.questionIndex; // 0 or 1
  const q = opts.q; // question object
  const gatherCfg = opts.gatherCfg; // { timeoutSec, speechTimeoutSec }
  const retryLimit = opts.retryLimit; // number
  const debugEnabled = !!opts.debugEnabled;

  const userInput = opts.userInput; // string
  const nextPhase = opts.nextPhase; // string, e.g. "detail" or "wrapup"
  const nextQuestionIndex = opts.nextQuestionIndex; // number or null
  const nextQuestion = opts.nextQuestion; // question object or null
  const transitionNoteOnAskNext = opts.transitionNoteOnAskNext; // string
  const transitionNoteOnSuccess = opts.transitionNoteOnSuccess; // string

  if (isDuplicateNoInputHit(session, phaseKey, !!userInput)) {
    console.log("OptionE duplicate no-input hit suppressed:", { callSid: callSid || "(none)", phase: phaseKey });
    saveSession(session);
    return sendTwiml(
      res,
      "<Say>" + escapeXml(q.prompt) + "</Say>" +
        "<Gather input=\"speech dtmf\" action=\"" +
        escapeXml(actionUrl) +
        "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" +
        String(gatherCfg.timeoutSec) +
        "\" speechTimeout=\"" +
        String(gatherCfg.speechTimeoutSec) +
        "\"></Gather>"
    );
  }

  if (!userInput) {
    logPhaseTransition(callSid, phaseKey, phaseKey, "silence_input");
    return handleQuestionRetry(res, callSid, session, actionUrl, q, phaseKey, gatherCfg, retryLimit);
  }

  if (!isValidAnswerForQuestion(q, userInput)) {
    logPhaseTransition(callSid, phaseKey, phaseKey, "invalid_input");
    return handleQuestionRetry(res, callSid, session, actionUrl, q, phaseKey, gatherCfg, retryLimit);
  }

  session.slots = session.slots || {};
  session.slots[q.key] = userInput;

  session.phase = nextPhase;
  if (transitionNoteOnSuccess) {
    logPhaseTransition(callSid, phaseKey, nextPhase, transitionNoteOnSuccess);
  } else {
    logPhaseTransition(callSid, phaseKey, nextPhase, "success");
  }

  session.retries = session.retries || {};
  session.retries[nextPhase] = 0;

  saveSession(session);

  if (nextPhase === WRAPUP_PHASE) {
    return sendTwiml(
      res,
      "<Say>Okay.</Say>" +
        "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
    );
  }

  if (nextQuestion) {
    if (transitionNoteOnAskNext) {
      logPhaseTransition(callSid, nextPhase, nextPhase, transitionNoteOnAskNext);
    }

    let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
    while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

    const transitionPlay =
      "<Play>" +
      escapeXml(
        baseUrl +
          "/tts?key=transition_one_more_question&text=" +
          encodeURIComponent("Okay. One more question.")
      ) +
      "</Play>";

    return sendTwiml(
      res,
      transitionPlay +
        buildAskQuestionTwiml(
          nextQuestion,
          actionUrl,
          gatherCfg.timeoutSec,
          gatherCfg.speechTimeoutSec
        )
    );

  }

  return sendTwiml(res, "<Say>Sorry, something went wrong.</Say><Hangup/>");
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendTwiml(res, inner) {
  res.status(200);
  res.type("text/xml");
  res.send(
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
      "<Response>" +
      inner +
      "</Response>"
  );
}

function logCallEnd(callSid, session, reason) {
  console.log("OptionE call end:", {
    callSid: callSid || "(none)",
    phase: session && session.phase ? session.phase : "(none)",
    retries: session && session.retries ? session.retries : {},
    slots: session && session.slots ? session.slots : {},
    reason: reason || "(unknown)",
    at: new Date().toISOString(),
  });
}

function getBaseUrl(req) {
  const envUrl = process.env.PUBLIC_BASE_URL;
  if (envUrl && String(envUrl).trim()) return String(envUrl).replace(/\/+$/, "");

  const host = req && req.headers ? req.headers.host : "";
  if (host) return "https://" + host;

  return "https://callready-stream.onrender.com";
}

async function handleVoiceOptionE(req, res) {
  const callStatusRaw = req && req.body && req.body.CallStatus ? String(req.body.CallStatus) : "";
  const callStatus = callStatusRaw.trim().toLowerCase();

  if (
    callStatus === "completed" ||
    callStatus === "canceled" ||
    callStatus === "busy" ||
    callStatus === "failed" ||
    callStatus === "no-answer"
  ) {
    res.type("text/xml");
    return res.send("<Response><Hangup/></Response>");
  }

  const debugEnabled = String((req.body && req.body.Debug) || "") === "1";

  function dbgSay(text) {
    if (!debugEnabled) return "";
    const safe = String(text || "").replace(/[<>&]/g, "");
    return "<Say>DEBUG " + safe + ".</Say>";
  }
      function dbgState(session, callSid) {
      if (!debugEnabled) return "";
      const pid = String(process.pid || "");
      const created = session && session.createdAt ? String(session.createdAt) : "none";
      const phase = session && session.phase ? String(session.phase) : "none";
      const sid = callSid ? String(callSid) : "none";
      return "<Say>DEBUG PID " + pid + ". SID " + sid + ". CREATED " + created + ". PHASE " + phase + ".</Say>";
    }

  try {
    const callSid = getCallSid(req);
    const session = getOrCreateSession(req);

    const basePath = req && req.path ? req.path : "/voice-test-medical";
    const baseUrl = getBaseUrl(req);
    const actionUrl = baseUrl + basePath;

    const speech = req && req.body && req.body.SpeechResult ? String(req.body.SpeechResult).trim() : "";
    const digits = req && req.body && req.body.Digits ? String(req.body.Digits).trim() : "";

    const confidenceRaw =
      req && req.body && req.body.Confidence !== undefined ? String(req.body.Confidence).trim() : "";

    const confidenceVal = confidenceRaw ? Number.parseFloat(confidenceRaw) : NaN;

    // If speech looks like nonsense (noise, breaths, bad recognition), treat it as no input
    // so normal retry logic handles it consistently.
    const speechLooksNonsense = speech && isNonsenseSpeechInput(speech, confidenceVal);
    const speechIsUsable = speech && !speechLooksNonsense;

    if (speechLooksNonsense) {
      const snippet = String(speech || "")
        .replace(/[^a-z0-9\s]/gi, "")
        .slice(0, 40);

      console.log("OptionE nonsense_rejected:", {
        callSid: callSid || "(none)",
        phase: session && session.phase ? session.phase : "(none)",
        confidence: Number.isFinite(confidenceVal) ? confidenceVal : "(none)",
        speechSnippet: snippet,
        at: new Date().toISOString(),
      });
    }

    const userInput = ((speechIsUsable ? speech : "") || digits).trim();

        // Detect whether this request is a Gather callback.
    // Twilio may POST SpeechResult or Digits even when empty if actionOnEmptyResult is true.
    // We use presence of the fields (not their values) to distinguish callback vs Redirect entry.
    const hasSpeechField = !!(req && req.body && Object.prototype.hasOwnProperty.call(req.body, "SpeechResult"));
    const hasDigitsField = !!(req && req.body && Object.prototype.hasOwnProperty.call(req.body, "Digits"));
    const isGatherCallback = hasSpeechField || hasDigitsField;

        // Debug-only jump shortcuts for faster testing.
    // Active ONLY when Debug=1 is present in the request.
    const debugEnabled = req && req.body && String(req.body.Debug || "").trim() === "1";
    const jump = req && req.body && req.body.Jump ? String(req.body.Jump).trim() : "";

    if (debugEnabled && jump) {
      // Reset common session fields so jumps are predictable.
      session.retries = {};
      session.helpCounts = {};
      session.pendingCoaching = null;
      session.slots = session.slots || {};
      if (typeof session.startedAt !== "number") session.startedAt = Date.now();

      // Determine which flow to test, default to medical.
      session.flowId = session.flowId || "medical";
      session.justJumped = true;


      if (jump === "ask_reason") {
        session.phase = "question";
        session.stepIndex = 0;
        saveSession(session);
      } else if (jump === "ask_detail") {
        session.phase = "question";
        session.stepIndex = 1;
        saveSession(session);
      } else if (jump === "wrapup_choice") {
        session.phase = WRAPUP_PHASE;
        session.stepIndex = 0;
        session.wrapupRetries = 0;
        saveSession(session);
      }
      // If jump value is unknown, do nothing and continue normal flow.
    }

    console.log("OptionE hit:", {
      callSid: callSid || "(none)",
      path: basePath,
      phase: session.phase,
      retries: session.retries || {},
      helpCounts: session.helpCounts || {},
      hasInput: !!userInput,
      question: "(config-driven)",
    });

    if (session.phase === "start") {
      // Start now collects intent, then selects a flow deterministically.
      session.flowId = null;
      session.stepIndex = 0;
      session.phase = "intent";
      session.startedAt = Date.now();
      session.retries = {};
      session.helpCounts = {};
      session.pendingCoaching = null;
      session.slots = session.slots || {};

      logPhaseTransition(callSid, "start", "intent", "ask_intent");
      saveSession(session);

      return sendTwiml(
        res,
        dbgSay(
          "START. CallStatus " +
            String(req.body && req.body.CallStatus ? req.body.CallStatus : "none") +
            ". Direction " +
            String(req.body && req.body.Direction ? req.body.Direction : "none")
        ) +
          dbgState(session, callSid) +
          "<Play>" + escapeXml(getBaseUrl(req) + "/tts?key=opener") + "</Play>" +
          "<Play>" + escapeXml(getBaseUrl(req) + "/tts?key=intent_prompt") + "</Play>" +
          "<Gather input=\"speech dtmf\" action=\"" +
          escapeXml(actionUrl) +
          "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"3\" speechTimeout=\"2\"></Gather>"
      );
    }

    if (session.phase === "intent") {
const cleaned = String(userInput || "")
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// If they said nothing, do not advance toward auto-selecting a flow.
// Just replay the intent retry prompt.
if (!cleaned) {
    session.retries = session.retries || {};
  session.retries.intent_silence = (session.retries.intent_silence || 0) + 1;
  saveSession(session);

  if (session.retries.intent_silence >= 1) {
    session.flowId = "medical";
    session.stepIndex = 0;
    session.phase = "announce";
    session.retries = {};
    session.helpCounts = {};
    session.pendingCoaching = null;
    logPhaseTransition(callSid, "intent", "announce", "auto_selected_flow_medical_on_silence");
    saveSession(session);
    return sendTwiml(res, "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>");
  }

  return sendTwiml(
    res,
    "<Play>" + escapeXml(getBaseUrl(req) + "/tts?key=intent_retry&text=" + encodeURIComponent("Say a call type, like scheduling an appointment, or say surprise me.")) + "</Play>" +
    "<Gather input=\"speech dtmf\" action=\"" +
    escapeXml(actionUrl) +
    "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"4\" speechTimeout=\"1\"></Gather>" +
    "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
  );
}

// Surprise detection
const surprisePhrases = [
  "surprise",
  "you choose",
  "choose for me",
  "pick",
  "pick one",
  "you pick",
  "anything",
  "whatever",
  "random",
  "doesnt matter",
  "doesn't matter"
];

const yesShort = ["yes", "yeah", "yep", "sure", "okay", "ok", "fine"];

const isSurprise =
  surprisePhrases.some(p => cleaned.includes(p)) ||
  yesShort.includes(cleaned) ||
  cleaned === "1";

// Basic invalid detection
const invalidSingles = ["help", "what", "hi", "hello", "test"];
const words = cleaned.split(" ").filter(Boolean);

const isTooGeneric =
  !cleaned ||
  cleaned.length < 3 ||
  (words.length === 1 && invalidSingles.includes(words[0]));

if (isSurprise) {
  session.flowId = "medical"; // default surprise choice for now
} else if (!isTooGeneric) {
  // Label-based matching
  const isHours =
    cleaned.includes("hours") ||
    cleaned.includes("open") ||
    cleaned.includes("close") ||
    cleaned.includes("closing") ||
    cleaned.includes("opening") ||
    cleaned.includes("what time") ||
    cleaned.includes("when are you") ||
    cleaned.includes("business hours") ||
    cleaned.includes("store hours");

  session.flowId = isHours ? "hours" : "medical";
  session.slots = session.slots || {};
  session.slots.intent_label = cleaned;
} else {
  // Retry intent up to 2 times, then default to surprise
  session.retries = session.retries || {};
  if (cleaned) session.retries.intent = (session.retries.intent || 0) + 1;
  saveSession(session);

  if (session.retries.intent >= 2) {
    session.flowId = "medical";
  } else {
    return sendTwiml(
      res,
      "<Play>" + escapeXml(getBaseUrl(req) + "/tts?key=intent_retry&text=" + encodeURIComponent("You can say a call type, like scheduling a medical appointment, or you can say surprise me and I'll pick something for you to try!")) + "</Play>" +
      "<Gather input=\"speech dtmf\" action=\"" +
      escapeXml(actionUrl) +
      "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"4\" speechTimeout=\"1\"></Gather>" +
      "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
    );
  }
}

      session.stepIndex = 0;
      session.phase = "announce";
      session.retries = {};
      session.helpCounts = {};
      session.pendingCoaching = null;

      logPhaseTransition(callSid, "intent", "announce", "selected_flow_" + String(session.flowId || "none"));
      saveSession(session);

      return sendTwiml(
        res,
        "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
      );

    }

        if (session.phase === "announce") {
      const flowId = session.flowId || "default";

      const flowLabel =
        flowId === "hours"
          ? "a business to ask about its hours"
          : "a medical office to make an appointment";

      const announceText =
        "Okay. Let's practice calling " +
        flowLabel +
        ". I will answer after the phone rings as if you just called.";

      const baseUrl = getBaseUrl(req);
      const ringUrl = getBaseUrl(req) + "/cellphonering.mp3";

      // Cache announcement audio by a stable key per flow
      const announceKey = "announce_" + flowId;
      const announceUrl =
        baseUrl +
        "/tts?key=" +
        encodeURIComponent(announceKey) +
        "&text=" +
        encodeURIComponent(announceText);

      // Advance to questions after the announcement and ring
      session.phase = "question";
      saveSession(session);

      return sendTwiml(
        res,
        "<Play>" + escapeXml(announceUrl) + "</Play>" +
          "<Play>" + escapeXml(ringUrl) + "</Play>" +
          "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
      );
    }

    if (session.phase === WRAPUP_PHASE) {
            // Debug jump entry: if we just jumped into wrapup with no input,
      // ask the wrapup choice prompt normally instead of treating it as silence.
      if (!userInput && session.justJumped) {
        session.justJumped = false;
        saveSession(session);

        let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
        while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

        const wrapupIntroPlay =
          "<Play>" +
          escapeXml(
            baseUrl +
              "/tts?key=wrapup_intro&text=" +
              encodeURIComponent("Nice work.")
          ) +
          "</Play>";

        const wrapupChoicePlay =
          "<Play>" +
          escapeXml(
            baseUrl +
              "/tts?key=wrapup_choice&text=" +
              encodeURIComponent("Do you want to practice again, or end session?")
          ) +
          "</Play>";

        return sendTwiml(
          res,
          wrapupIntroPlay +
            wrapupChoicePlay +
            "<Gather input=\"speech dtmf\" action=\"" +
            escapeXml(actionUrl) +
            "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"4\" speechTimeout=\"1\"></Gather>"
        );
      }

      // End-of-session choice: practice again or end.
      const limitSeconds = Number(process.env.OPTION_E_SESSION_LIMIT_SECONDS || 300);
      const startedAt = typeof session.startedAt === "number" ? session.startedAt : null;
      const elapsedSeconds = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;

      const shouldForceEnd = startedAt && elapsedSeconds >= limitSeconds;

      const raw = String(userInput || "").toLowerCase().trim();
      const cleaned = raw.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

      const isAgain =
        cleaned === "1" ||
        cleaned.includes("again") ||
        cleaned.includes("practice again") ||
        cleaned.includes("one more time") ||
        cleaned.includes("restart");

      const isEnd =
        cleaned === "2" ||
        cleaned.includes("end") ||
        cleaned.includes("stop") ||
        cleaned.includes("done") ||
        cleaned.includes("hang up") ||
        cleaned.includes("hangup");

      const AUDIO_URL = "https://callready-stream.onrender.com/tts?key=wrapup";

      if (shouldForceEnd) {
        logCallEnd(callSid, session, "forced_end_time_limit");
        if (callSid) clearSession(callSid);
        return sendTwiml(res, "<Play>" + AUDIO_URL + "</Play><Hangup/>");
      }

      session.wrapupRetries = typeof session.wrapupRetries === "number" ? session.wrapupRetries : 0;

      // If no input, or invalid input, retry a couple times, then end.
      if (!userInput) {
        session.wrapupRetries += 1;
        saveSession(session);

        if (session.wrapupRetries >= 2) {
          logCallEnd(callSid, session, "wrapup_choice_no_input_end");
          if (callSid) clearSession(callSid);
          return sendTwiml(res, "<Play>" + AUDIO_URL + "</Play><Hangup/>");
        }

        return sendTwiml(
          res,
          "<Say>I did not catch that.</Say>" +
            "<Say>Say practice again, or say end session.</Say>" +
            "<Gather input=\"speech dtmf\" action=\"" +
            escapeXml(actionUrl) +
            "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"4\" speechTimeout=\"1\"></Gather>"
        );
      }

      if (isAgain) {
        // Reset to a fresh session that can go a different direction.
        session.flowId = null;
        session.stepIndex = 0;
        session.phase = "intent";
        session.retries = {};
        session.helpCounts = {};
        session.pendingCoaching = null;
        session.slots = {};
        session.wrapupRetries = 0;

        // Reset the session timer for the new practice session.
        session.startedAt = Date.now();

        logPhaseTransition(callSid, WRAPUP_PHASE, "intent", "practice_again_reset");
        saveSession(session);

      let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
      while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

      const restartIntroPlay =
        "<Play>" +
        escapeXml(
          baseUrl +
            "/tts?key=restart_intro&text=" +
            encodeURIComponent("Okay. Let us practice another call.")
        ) +
        "</Play>";

      const restartIntentPlay =
        "<Play>" +
        escapeXml(
          baseUrl +
            "/tts?key=restart_intent_prompt&text=" +
            encodeURIComponent("Tell me what call you want to practice, or say surprise me.")
        ) +
        "</Play>";

      return sendTwiml(
        res,
        restartIntroPlay +
          restartIntentPlay +
          "<Gather input=\"speech dtmf\" action=\"" +
          escapeXml(actionUrl) +
          "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"4\" speechTimeout=\"1\"></Gather>"
      );

      }

      if (isEnd) {
        logCallEnd(callSid, session, "wrapup_choice_end");
        if (callSid) clearSession(callSid);
        return sendTwiml(res, "<Play>" + AUDIO_URL + "</Play><Hangup/>");
      }

      // Invalid choice, retry a couple times, then end.
      session.wrapupRetries += 1;
      saveSession(session);

      if (session.wrapupRetries >= 2) {
        logCallEnd(callSid, session, "wrapup_choice_invalid_end");
        if (callSid) clearSession(callSid);
        return sendTwiml(res, "<Play>" + AUDIO_URL + "</Play><Hangup/>");
      }

      let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
      while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

      const wrapupRetryPlay =
        "<Play>" +
        escapeXml(
          baseUrl +
            "/tts?key=wrapup_retry&text=" +
            encodeURIComponent("I did not catch a clear choice. Do you want practice again, or end session?")
        ) +
        "</Play>";

      return sendTwiml(
        res,
        wrapupRetryPlay +
          "<Gather input=\"speech dtmf\" action=\"" +
          escapeXml(actionUrl) +
          "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"4\" speechTimeout=\"1\"></Gather>"
      );

    }

    if (session.phase === "question") {
            // Priority: if coaching is pending, deliver it before any question-ask shortcuts.
      if (session.pendingCoaching) {
        const pendingKey = String(session.pendingCoaching.key || "");
        const pendingHelpCount =
          typeof session.pendingCoaching.helpCount === "number"
            ? session.pendingCoaching.helpCount
            : 1;

        const coachingRaw = await getCoachingLine(pendingKey, pendingHelpCount, session);
        const coaching = makeSafeCoachingLine(
          coachingRaw,
          "Try a short, specific answer. You can keep it simple."
        );

        const coachingSource =
          coachingRaw === getCoachingLineForKey(pendingKey, pendingHelpCount) ? "fallback" : "ai";

        const reason =
          session && session.coachingMeta && session.coachingMeta.reason
            ? String(session.coachingMeta.reason)
            : "unknown";

        let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
        while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

        const coachingKey =
          "coach_" + String(callSid || "noid") + "_" + String(pendingKey || "unknown");

        const statusUrl =
          baseUrl +
          "/tts-status?key=" +
          encodeURIComponent(coachingKey);

        const coachingPlayUrl =
          baseUrl +
          "/tts?key=" +
          encodeURIComponent(coachingKey) +
          "&text=" +
          encodeURIComponent(String(coaching));

        session.pendingCoaching = session.pendingCoaching || {};
        session.pendingCoaching.preparedKey = coachingKey;
        session.pendingCoaching.preparedText = coaching;
        saveSession(session);


        try {
          const statusResp = await fetch(statusUrl, { method: "GET" });
          const ready = statusResp && statusResp.status === 200;

          if (!ready) {
            // Prewarm: trigger TTS generation on a cache miss, then wait via Redirect.
            try { fetch(coachingPlayUrl).catch(() => {}); } catch (e) {}

        // Use a deterministic rotating filler from the preloaded lookup pool.
        // Varies within a call, and varies across calls, but is fully repeatable.
        session.fillerCounts = session.fillerCounts || {};
        const fillerCategory = "lookup";
        const priorCount = typeof session.fillerCounts[fillerCategory] === "number" ? session.fillerCounts[fillerCategory] : 0;

        const poolSize = 7; // filler_lookup_01 .. filler_lookup_07

        // Deterministic start index based on CallSid (stable per call).
        const sid = String(callSid || "");
        let hash = 0;
        for (let i = 0; i < sid.length; i++) {
          const ch = sid.charCodeAt(i);
          hash = ((hash * 31) + ch) >>> 0;
        }
        const start = poolSize > 0 ? (hash % poolSize) : 0;

        // Rotate within the call using a counter.
        const idx = ((start + priorCount) % poolSize) + 1;

        session.fillerCounts[fillerCategory] = priorCount + 1;
        saveSession(session);

        const fillerKey = "filler_lookup_" + String(idx).padStart(2, "0");

        const fillerPlay =
          "<Play>" +
          escapeXml(baseUrl + "/tts?key=" + encodeURIComponent(fillerKey)) +
          "</Play>";

          }
        } catch (e) {
          // If status check fails, fall through and attempt to play anyway.
        }
        session.pendingCoaching = null;
        saveSession(session);

        // Ask the current question again after coaching, so the student can answer immediately.
        const flowId = session.flowId || "default";
        const flow = FLOWS[flowId] || FLOWS["default"] || [];
        const idx = typeof session.stepIndex === "number" ? session.stepIndex : 0;
        const currentKey = flow[idx];
        const currentQ = OPTION_E_QUESTIONS.find((qq) => qq && qq.key === currentKey);

        const gatherCfg =
          PHASES[currentKey] && PHASES[currentKey].gather
            ? PHASES[currentKey].gather
            : { timeoutSec: 3, speechTimeoutSec: 1 };

        return sendTwiml(
          res,
          "<Play>" +
            escapeXml(coachingPlayUrl) +
            "</Play>" +
            buildAskQuestionTwiml(
              currentQ,
              actionUrl,
              gatherCfg.timeoutSec,
              gatherCfg.speechTimeoutSec
            )
        );
      }

      const flowId = session.flowId || "default";
      const flow = FLOWS[flowId] || FLOWS["default"] || [];
      console.log("OptionE flow debug:", {
        callSid: callSid || "(none)",
        flowId,
        flowLength: flow.length,
        flow,
        stepIndex: typeof session.stepIndex === "number" ? session.stepIndex : "(none)",
        hasInput: !!userInput,
      });

      const idx = typeof session.stepIndex === "number" ? session.stepIndex : 0;

      // First entry into question phase after announce arrives via Redirect with no input.
      // On that first hit, we should ASK the first question, not trigger a retry prompt.
      if (!userInput && idx === 0 && !session.pendingCoaching && !isGatherCallback) {

        const firstKey = flow[0];
        const firstQ = OPTION_E_QUESTIONS.find((qq) => qq && qq.key === firstKey);

        session.retries = session.retries || {};
        const firstRetries = session.retries[firstKey] || 0;

        // Only treat it as first-entry if we have not started retrying yet.
        if (firstQ && firstRetries === 0) {
          const gatherCfg0 =
            PHASES[firstKey] && PHASES[firstKey].gather
              ? PHASES[firstKey].gather
              : { timeoutSec: 3, speechTimeoutSec: 1 };

        if (firstQ && firstRetries === 0) {
          const gatherCfg0 =
            PHASES[firstKey] && PHASES[firstKey].gather
              ? PHASES[firstKey].gather
              : { timeoutSec: 3, speechTimeoutSec: 1 };

          return sendTwiml(
            res,
            buildAskQuestionTwiml(
              firstQ,
              actionUrl,
              gatherCfg0.timeoutSec,
              gatherCfg0.speechTimeoutSec
            )
          );
        }

        }
      }

      // Debug jump entry: if we just jumped into question phase with no input,
      // ask the current question normally instead of treating it as silence.
      if (!userInput && session.justJumped && !session.pendingCoaching) {

        session.justJumped = false;
        saveSession(session);

        const currentKey = flow[idx];
        const currentQ = OPTION_E_QUESTIONS.find((qq) => qq && qq.key === currentKey);

        const gatherCfgJump =
          PHASES[currentKey] && PHASES[currentKey].gather
            ? PHASES[currentKey].gather
            : { timeoutSec: 3, speechTimeoutSec: 1 };

        if (currentQ) {
          return sendTwiml(
            res,
            buildAskQuestionTwiml(
              currentQ,
              actionUrl,
              gatherCfgJump.timeoutSec,
              gatherCfgJump.speechTimeoutSec
            )
          );
        }
      }

      if (idx < 0 || idx >= flow.length) {
        // If we somehow land out of bounds, treat it as wrapup choice.
        session.phase = WRAPUP_PHASE;
        session.wrapupRetries = 0;
        if (typeof session.startedAt !== "number") session.startedAt = Date.now();
        saveSession(session);

        let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
        while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

        const wrapupIntroPlay =
          "<Play>" +
          escapeXml(
            baseUrl +
              "/tts?key=wrapup_intro&text=" +
              encodeURIComponent("Nice work.")
          ) +
          "</Play>";

        const wrapupChoicePlay =
          "<Play>" +
          escapeXml(
            baseUrl +
              "/tts?key=wrapup_choice&text=" +
              encodeURIComponent("Do you want to practice again, or end session?")
          ) +
          "</Play>";

        return sendTwiml(
          res,
          wrapupIntroPlay +
            wrapupChoicePlay +
            "<Gather input=\"speech dtmf\" action=\"" +
            escapeXml(actionUrl) +
            "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"4\" speechTimeout=\"1\"></Gather>"
        );

      }

      const key = flow[idx];
      const q = OPTION_E_QUESTIONS.find((qq) => qq && qq.key === key);

      if (!q) {
        logCallEnd(callSid, session, "unknown_question_key_" + String(key || ""));
        if (callSid) clearSession(callSid);
        return sendTwiml(res, "<Say>Option E reached an unknown step and will end now.</Say><Hangup/>");
      }

      session.retries = session.retries || {};
      session.retries[key] = session.retries[key] || 0;

      const gatherCfg =
        PHASES[key] && PHASES[key].gather
          ? PHASES[key].gather
          : { timeoutSec: 3, speechTimeoutSec: 1 };

      const retryLimit = typeof q.retryLimit === "number" ? q.retryLimit : 1;

      const cleanedForHelp = String(userInput || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const helpPhrases = [
        "what should i say",
        "i dont know what to say",
        "im stuck",
        "give me an example",
        "coach me",
        "can you help me",
        "help me practice",
        "can you give me an example",
      ];

      const matchesExplicitPhrase = helpPhrases.some((p) => cleanedForHelp.includes(p));

      const shortHelpPatterns = [/^help$/, /^i need help$/, /^i need some help$/];

      const matchesShortHelp = shortHelpPatterns.some((re) => re.test(cleanedForHelp));

      const isCoachingHelp = matchesExplicitPhrase || matchesShortHelp;

      if (isCoachingHelp) {
        session.helpCounts = session.helpCounts || {};
        session.helpCounts[key] = (session.helpCounts[key] || 0) + 1;

        const helpCount = session.helpCounts[key];

        session.pendingCoaching = { key, helpCount };
        saveSession(session);

        const fallbackFiller = "Okay. Give me a second.";

        let filler = fallbackFiller;

        try {
          filler = await getFillerLine(session);
        } catch (e) {
          filler = fallbackFiller;
        }

        await sleepMs(300);

        let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
        while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

        // Use a deterministic rotating filler from the preloaded lookup pool.
        // Varies within a call and across calls, but is repeatable.
        session.fillerCounts = session.fillerCounts || {};
        const fillerCategory = "lookup";
        const priorCount = typeof session.fillerCounts[fillerCategory] === "number" ? session.fillerCounts[fillerCategory] : 0;

        const poolSize = 7; // filler_lookup_01 .. filler_lookup_07

        const sid = String(callSid || "");
        let hash = 0;
        for (let i = 0; i < sid.length; i++) {
          const ch = sid.charCodeAt(i);
          hash = ((hash * 31) + ch) >>> 0;
        }
        const start = poolSize > 0 ? (hash % poolSize) : 0;
        const idx = ((start + priorCount) % poolSize) + 1;

        session.fillerCounts[fillerCategory] = priorCount + 1;
        saveSession(session);

        const fillerKey = "filler_lookup_" + String(idx).padStart(2, "0");

        const fillerPlay =
          "<Play>" +
          escapeXml(baseUrl + "/tts?key=" + encodeURIComponent(fillerKey)) +
          "</Play>";


        return sendTwiml(
          res,
          fillerPlay +
            "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
        );

      }

      const ok = isValidAnswerForQuestion(q, userInput);

      if (!ok) {
        return handleQuestionRetry(res, callSid, session, actionUrl, q, key, gatherCfg, retryLimit);
      }

      session.slots = session.slots || {};
      session.slots[key] = userInput;

      if (session.helpCounts && session.helpCounts[key]) {
        session.helpCounts[key] = 0;
      }

      logPhaseTransition(callSid, "question", "question", "answered_" + key);
      session.stepIndex = idx + 1;
      saveSession(session);

      if (session.stepIndex >= flow.length) {
        // Move into wrapup choice phase instead of ending immediately.
        session.phase = WRAPUP_PHASE;
        session.wrapupRetries = 0;
        if (typeof session.startedAt !== "number") session.startedAt = Date.now();
        saveSession(session);

      let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
      while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

      const transitionPlay =
        "<Play>" +
        escapeXml(
          baseUrl +
            "/tts?key=transition_one_more_question&text=" +
            encodeURIComponent("Okay. One more question.")
        ) +
        "</Play>";

      return sendTwiml(
        res,
        transitionPlay +
          buildAskQuestionTwiml(
            nextQ,
            actionUrl,
            PHASES[nextQ.key] && PHASES[nextQ.key].gather ? PHASES[nextQ.key].gather.timeoutSec : 3,
            PHASES[nextQ.key] && PHASES[nextQ.key].gather ? PHASES[nextQ.key].gather.speechTimeoutSec : 1
          )
      );

      }

      const nextKey = flow[session.stepIndex];
      const nextQ = OPTION_E_QUESTIONS.find((qq) => qq && qq.key === nextKey);

      if (!nextQ) {
        logCallEnd(callSid, session, "unknown_next_question_key_" + String(nextKey || ""));
        if (callSid) clearSession(callSid);
        return sendTwiml(res, "<Say>Option E reached an unknown step and will end now.</Say><Hangup/>");
      }

      let baseUrl = process.env.PUBLIC_BASE_URL || "https://callready-stream.onrender.com";
      while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

      const transitionPlay =
        "<Play>" +
        escapeXml(
          baseUrl +
            "/tts?key=transition_one_more_question&text=" +
            encodeURIComponent("Okay. One more question.")
        ) +
        "</Play>";

      return sendTwiml(
        res,
        transitionPlay +
          buildAskQuestionTwiml(
            nextQ,
            actionUrl,
            PHASES[nextQ.key] && PHASES[nextQ.key].gather ? PHASES[nextQ.key].gather.timeoutSec : 3,
            PHASES[nextQ.key] && PHASES[nextQ.key].gather ? PHASES[nextQ.key].gather.speechTimeoutSec : 1
          )
      );

    }

    logCallEnd(callSid, session, "unknown_phase_fallback");
    if (callSid) clearSession(callSid);
    return sendTwiml(res, "<Say>Option E reached an unknown step and will end now.</Say><Hangup/>");
  } catch (err) {
    const safeCallSid = getCallSid(req) || "(unknown)";
    const safeSession = session || {};

    const msg = err && err.message ? String(err.message) : String(err);
    console.error("OptionE error:", msg);

    console.log("OptionE call end:", {
      callSid: safeCallSid,
      phase: "error",
      retries: safeSession.retries || {},
      slots: safeSession.slots || {},
      reason: "exception_" + msg,
      at: new Date().toISOString(),
    });

    return sendTwiml(res, buildErrorTwiml());
  }
}

module.exports = { handleVoiceOptionE };
