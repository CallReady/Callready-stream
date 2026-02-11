//OptionE normalize transition logging
const { getOrCreateSession, saveSession, clearSession, getCallSid } = require("./sessionStore");
const WRAPUP_PHASE = "wrapup";
const OPTION_E_QUESTIONS = [
  {
    key: "reason",
    prompt: "In one sentence, what are you calling about today?",
    invalidPrompt: "I did not catch a clear reason. Try again.",
    retryLimit: 3,
  },
  {
    key: "detail",
    prompt: "What is one important detail they might ask you for?",
    invalidPrompt: "I did not catch that. Please say the detail again.",
    retryLimit: 2,
  },
];

function buildAskQuestionTwiml(q, actionUrl, timeoutSec, speechTimeoutSec) {
  if (!q) {
    return "<Say>Sorry, something went wrong.</Say><Hangup/>";
  }

  return (
    "<Say>" +
    escapeXml(q.prompt) +
    "</Say>" +
    "<Gather input=\"speech dtmf\" action=\"" +
    escapeXml(actionUrl) +
    "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" +
    String(timeoutSec) +
    "\" speechTimeout=\"" +
    String(speechTimeoutSec) +
    "\"></Gather>"
  );
}

const PHASES = {
  reason: {
    gather: { timeoutSec: 3, speechTimeoutSec: 1 },
    retryLimit: OPTION_E_QUESTIONS[0].retryLimit,
  },
  detail: {
    gather: { timeoutSec: 3, speechTimeoutSec: 1 },
    retryLimit: OPTION_E_QUESTIONS[1].retryLimit,
  },
  wrapup: {
    retryLimit: 0,
  },
};

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

  return true;
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
  if (!q || !q.key) return false;

  if (q.key === "reason") return isValidReasonInput(text);
  if (q.key === "detail") return isValidDetailInput(text);

  // Default to basic validity
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

  return sendTwiml(
    res,
    "<Say>" + escapeXml(q && q.invalidPrompt ? q.invalidPrompt : "I did not catch that. Try again.") + "</Say>" +
      "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" + String(gatherCfg.timeoutSec) + "\" speechTimeout=\"" + String(gatherCfg.speechTimeoutSec) + "\"></Gather>" +
      "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
  );
}

function handleGenericQuestionPhase(opts) {
  const res = opts.res;
  const callSid = opts.callSid;
  const session = opts.session;
  const actionUrl = opts.actionUrl;

  const phaseKey = opts.phaseKey; // "reason" or "detail"
  const questionIndex = opts.questionIndex; // 0 or 1
  const q = opts.q; // question object
  const gatherCfg = opts.gatherCfg; // { timeoutSec, speechTimeoutSec }
  const retryLimit = opts.retryLimit; // number
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

    return sendTwiml(
      res,
      "<Say>Got it.</Say>" +
        "<Say>One more question.</Say>" +
        buildAskQuestionTwiml(nextQuestion, actionUrl, gatherCfg.timeoutSec, gatherCfg.speechTimeoutSec)
    );
  }

  return sendTwiml(res, "<Say>Sorry, something went wrong.</Say><Hangup/>");
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

function handleVoiceOptionE(req, res) {
  try {
    const callSid = getCallSid(req);
    const session = getOrCreateSession(req);

    const basePath = req && req.path ? req.path : "/voice-test-medical";
    const baseUrl = getBaseUrl(req);
    const actionUrl = baseUrl + basePath;

    const speech = req && req.body && req.body.SpeechResult ? String(req.body.SpeechResult).trim() : "";
    const digits = req && req.body && req.body.Digits ? String(req.body.Digits).trim() : "";
    const userInput = (speech || digits).trim();

    console.log("OptionE hit:", {
    callSid: callSid || "(none)",
    path: basePath,
    phase: session.phase,
    retries: session.retries || {},
    hasInput: !!userInput,
    question: "(config-driven)",
  });

    if (session.phase === "start") {
      session.phase = "reason";
      session.retries = {};
      session.retries.reason = 0;
      session.slots = session.slots || {};

      logPhaseTransition(callSid, "start", "reason", "enter_reason");
      saveSession(session);

      return sendTwiml(
        res,
        "<Say>Hi. This is CallReady practice mode.</Say>" +
          buildAskQuestionTwiml(
            OPTION_E_QUESTIONS[0],
            actionUrl,
            PHASES.reason.gather.timeoutSec,
            PHASES.reason.gather.speechTimeoutSec
          )
      );
    }

    if (session.phase === "reason" || session.phase === "detail") {
      const idx = OPTION_E_QUESTIONS.findIndex((qq) => qq && qq.key === session.phase);
      if (idx < 0) {
        logCallEnd(callSid, session, "unknown_question_phase_" + String(session.phase || ""));
        if (callSid) clearSession(callSid);
        return sendTwiml(res, "<Say>Option E reached an unknown step and will end now.</Say><Hangup/>");
      }
      const q = OPTION_E_QUESTIONS[idx];

      const phaseKey = q && q.key ? q.key : "reason";
      const gatherCfg = PHASES[phaseKey] && PHASES[phaseKey].gather ? PHASES[phaseKey].gather : { timeoutSec: 3, speechTimeoutSec: 1 };
      const retryLimit = PHASES[phaseKey] && typeof PHASES[phaseKey].retryLimit === "number" ? PHASES[phaseKey].retryLimit : 1;

      const hasNext = idx + 1 < OPTION_E_QUESTIONS.length;
      const nextPhase = hasNext ? OPTION_E_QUESTIONS[idx + 1].key : WRAPUP_PHASE;
      const nextQuestion = hasNext ? OPTION_E_QUESTIONS[idx + 1] : null;

      return handleGenericQuestionPhase({
        res,
        callSid,
        session,
        actionUrl,

        phaseKey,
        q,
        gatherCfg,
        retryLimit,

        userInput,

        nextPhase,
        nextQuestion,

        transitionNoteOnSuccess: "answered_" + phaseKey,
        transitionNoteOnAskNext: null,
      });
    }

    if (session.phase === WRAPUP_PHASE) {
      logCallEnd(callSid, session, "normal_wrapup");
      if (callSid) clearSession(callSid);

      return sendTwiml(
        res,
        "<Say>Nice work. You can practice again anytime.</Say>" +
          "<Hangup/>"
      );
    }

    logCallEnd(callSid, session, "unknown_phase_fallback");
    if (callSid) clearSession(callSid);
    return sendTwiml(res, "<Say>Option E reached an unknown step and will end now.</Say><Hangup/>");

  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.log("OptionE error:", msg);
    logCallEnd("(unknown)", { phase: "error", retries: {}, slots: {} }, "exception_" + msg);
    return sendTwiml(res, "<Say>Sorry, an internal error occurred. Please try again.</Say><Hangup/>");
  }

}

module.exports = { handleVoiceOptionE };
