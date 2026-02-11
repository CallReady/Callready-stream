//Stable Option E after troubleshooting twilio webhook and more
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
  quick: ["reason"]
};

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

const PHASES = OPTION_E_QUESTIONS.reduce((acc, q) => {
  if (q && q.key) {
    acc[q.key] = {
      gather: { timeoutSec: 3, speechTimeoutSec: 1 },
      retryLimit: typeof q.retryLimit === "number" ? q.retryLimit : 1,
    };
  }
  return acc;
}, {});

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
  const debugEnabled = String((req.body && req.body.Debug) || "") === "1";

  function dbgSay(text) {
    if (!debugEnabled) return "";
    const safe = String(text || "").replace(/[<>&]/g, "");
    return "<Say>DEBUG " + safe + ".</Say>";
  }

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
      // Library-driven: choose a flow and start at stepIndex 0
      session.flowId = "medical";
      session.stepIndex = 0;
      session.phase = "question";
      session.retries = {};
      session.slots = session.slots || {};

      logPhaseTransition(callSid, "start", "question", "enter_flow_" + String(session.flowId));
      saveSession(session);

      const flowId = session.flowId || "default";
      const flow = FLOWS[flowId] || FLOWS["default"] || [];
      const defaultFlow = FLOWS["default"] || [];

      const firstKey =
        (flow && flow.length ? flow[0] : null) ||
        (defaultFlow && defaultFlow.length ? defaultFlow[0] : null) ||
        "reason";

      const q0 =
        OPTION_E_QUESTIONS.find((qq) => qq && qq.key === firstKey) ||
        OPTION_E_QUESTIONS.find((qq) => qq && qq.key === "reason") ||
        OPTION_E_QUESTIONS[0];

      return sendTwiml(
        res,
        dbgSay("START. CallStatus " + String(req.body && req.body.CallStatus ? req.body.CallStatus : "none") + ". Direction " + String(req.body && req.body.Direction ? req.body.Direction : "none")) +
        "<Say>Hi. This is CallReady practice mode.</Say>" +

          buildAskQuestionTwiml(
            q0,
            actionUrl,
            PHASES[q0.key] && PHASES[q0.key].gather ? PHASES[q0.key].gather.timeoutSec : 3,
            PHASES[q0.key] && PHASES[q0.key].gather ? PHASES[q0.key].gather.speechTimeoutSec : 1
          )
      );
    }

    if (session.phase === "question") {
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

      // Current step comes from the flow list
      const idx = typeof session.stepIndex === "number" ? session.stepIndex : 0;

      if (idx < 0 || idx >= flow.length) {
        session.phase = WRAPUP_PHASE;
        saveSession(session);

        logCallEnd(callSid, session, "normal_wrapup");
        if (callSid) clearSession(callSid);

        return sendTwiml(
          res,
          "<Say>DEBUG WRAPUP. flowId " +
            String(session.flowId || "none") +
            ". stepIndex " +
            String(typeof session.stepIndex === "number" ? session.stepIndex : "none") +
            ". flowLength " +
            String(flow && Array.isArray(flow) ? flow.length : "none") +
            ".</Say>" +
            "<Say>Nice work. You can practice again anytime.</Say><Hangup/>"
        );

      } else {

        const key = flow[idx];
        const q = OPTION_E_QUESTIONS.find((qq) => qq && qq.key === key);

        if (!q) {
          logCallEnd(callSid, session, "unknown_question_key_" + String(key || ""));
          if (callSid) clearSession(callSid);
          return sendTwiml(res, "<Say>Option E reached an unknown step and will end now.</Say><Hangup/>");
        }

        // Retry tracking per question key
        session.retries = session.retries || {};
        session.retries[key] = session.retries[key] || 0;

        const gatherCfg =
          PHASES[key] && PHASES[key].gather
            ? PHASES[key].gather
            : { timeoutSec: 3, speechTimeoutSec: 1 };

        const retryLimit =
          typeof q.retryLimit === "number" ? q.retryLimit : 1;

        // If no input or invalid input, retry or end
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

        const isCoachingHelp = helpPhrases.some((p) => cleanedForHelp.includes(p));

        if (isCoachingHelp) {
          // Track help requests per question key so we can escalate coaching
          session.helpCounts = session.helpCounts || {};
          session.helpCounts[key] = (session.helpCounts[key] || 0) + 1;
          saveSession(session);

          const helpCount = session.helpCounts[key];

          const coachingByKey = {
            reason: {
              first:
                "Try a simple one sentence reason, for example, I need to schedule an appointment, or I have a question about a symptom.",
              second:
                "Try starting with: I’m calling because I need to. Then add one short detail, for example, I’m calling because I need to schedule a checkup.",
            },
            detail: {
              first:
                "Name one detail they might ask for, for example, your date of birth, your insurance, or your address.",
              second:
                "If you are stuck, pick one of these and say it out loud: My date of birth is. My insurance is. My address is. Choose one and fill in the blank.",
            },
          };

          const perKey = coachingByKey[key] || {};
          const coaching =
            helpCount >= 2
              ? (perKey.second || "Let us make it easier. Use a starter phrase, then fill in one blank.")
              : (perKey.first || "Try a short, specific answer. You can keep it simple.");

          return sendTwiml(
            res,
            "<Say>" + escapeXml(coaching) + "</Say>" +
              buildAskQuestionTwiml(
                q,
                actionUrl,
                gatherCfg.timeoutSec,
                gatherCfg.speechTimeoutSec
              )
          );
        }

        const ok = isValidAnswerForQuestion(q, userInput);

        if (!ok) {
          return handleQuestionRetry(
            res,
            callSid,
            session,
            actionUrl,
            q,
            key,
            gatherCfg,
            retryLimit
          );
        }

        // Valid answer, store slot and advance
        session.slots = session.slots || {};
        session.slots[key] = userInput;

        logPhaseTransition(callSid, "question", "question", "answered_" + key);
        session.stepIndex = idx + 1;
        saveSession(session);

        // If we finished the flow, wrap up
        if (session.stepIndex >= flow.length) {
          session.phase = WRAPUP_PHASE;
          saveSession(session);

          logCallEnd(callSid, session, "normal_wrapup");
          if (callSid) clearSession(callSid);

          return sendTwiml(
            res,
            "<Say>Nice work. You can practice again anytime.</Say><Hangup/>"
          );

        }

        // Ask the next question
        const nextKey = flow[session.stepIndex];
        const nextQ = OPTION_E_QUESTIONS.find((qq) => qq && qq.key === nextKey);

        if (!nextQ) {
          logCallEnd(callSid, session, "unknown_next_question_key_" + String(nextKey || ""));
          if (callSid) clearSession(callSid);
          return sendTwiml(res, "<Say>Option E reached an unknown step and will end now.</Say><Hangup/>");
        }

        return sendTwiml(
          res,
          "<Say>Got it.</Say>" +
            "<Say>One more question.</Say>" +
            buildAskQuestionTwiml(
              nextQ,
              actionUrl,
              PHASES[nextQ.key] && PHASES[nextQ.key].gather ? PHASES[nextQ.key].gather.timeoutSec : 3,
              PHASES[nextQ.key] && PHASES[nextQ.key].gather ? PHASES[nextQ.key].gather.speechTimeoutSec : 1
            )
        );
      }
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
