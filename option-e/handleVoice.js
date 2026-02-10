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

const PHASES = {
  start: {
    nextOnEnter: "reason",
    gather: { timeoutSec: 3, speechTimeoutSec: 1 },
    retryLimit: 0,
  },
  reason: {
    nextOnSuccess: "detail",
    gather: { timeoutSec: 3, speechTimeoutSec: 1 },
    retryLimit: 3,
  },
    detail: {
    nextOnSuccess: "wrapup",
    gather: { timeoutSec: 3, speechTimeoutSec: 1 },
    retryLimit: 2,
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

  return true;
}


function handleReasonRetry(res, callSid, session, actionUrl, limitNote) {
  session.retries = session.retries || {};
  session.retries.reason = (session.retries.reason || 0) + 1;
  saveSession(session);

    if ((session.retries && session.retries.reason ? session.retries.reason : 0) >= PHASES.reason.retryLimit) {
    logCallEnd(callSid, session, "reason_retry_limit_reached");
    if (callSid) clearSession(callSid);

    logCallEnd(callSid, session, "reason_retry_limit_reached");
    return sendTwiml(
      res,
      "<Say>No worries. Let us stop here for now, and you can try again anytime.</Say>" +
        "<Hangup/>"
    );

  }


  return sendTwiml(
    res,
    "<Say>I did not catch a clear reason. Try again.</Say>" +
      "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" + String(PHASES.reason.gather.timeoutSec) + "\" speechTimeout=\"" + String(PHASES.reason.gather.speechTimeoutSec) + "\"></Gather>" +
      "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
  );

}

function handleDetailRetry(res, callSid, session, actionUrl, limitNote) {
  session.retries = session.retries || {};
  session.retries.detail = (session.retries.detail || 0) + 1;
  saveSession(session);

  if ((session.retries && session.retries.detail ? session.retries.detail : 0) >= PHASES.detail.retryLimit) {
    logCallEnd(callSid, session, "detail_retry_limit_reached");
    if (callSid) clearSession(callSid);

    logCallEnd(callSid, session, "detail_retry_limit_reached");
    return sendTwiml(
      res,
      "<Say>No worries. Let us stop here for now, and you can try again anytime.</Say>" +
        "<Hangup/>"
    );

  }

  return sendTwiml(
    res,
    "<Say>I did not catch that. Please say the detail again.</Say>" +
      "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" + String(PHASES.detail.gather.timeoutSec) + "\" speechTimeout=\"" + String(PHASES.detail.gather.speechTimeoutSec) + "\"></Gather>" +
      "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
  );

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
  });

    if (session.phase === "start") {
      session.phase = PHASES.start.nextOnEnter;
      logPhaseTransition(callSid, "start", session.phase, "enter_reason");
      session.retries = {};
      session.retries.reason = 0;
      saveSession(session);
            if (userInput) {
        if (!isValidReasonInput(userInput)) {
          logPhaseTransition(callSid, "start", "start", "start_got_invalid_input");
          return sendTwiml(
            res,
            "<Say>I did not catch a clear reason. Try again.</Say>" +
              "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" + String(PHASES.reason.gather.timeoutSec) + "\" speechTimeout=\"" + String(PHASES.reason.gather.speechTimeoutSec) + "\"></Gather>"
          );
        }

        session.slots = session.slots || {};
        session.slots.reason = userInput;

        session.phase = "detail";
        logPhaseTransition(callSid, "start", "detail", "start_got_reason");
        session.retries.detail = 0;
        saveSession(session);

        return sendTwiml(
          res,
          "<Say>Got it.</Say>" +
            "<Say>One more question.</Say>" +
            "<Say>What is one important detail they might ask you for?</Say>" +
            "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" + String(PHASES.detail.gather.timeoutSec) + "\" speechTimeout=\"" + String(PHASES.detail.gather.speechTimeoutSec) + "\"></Gather>"
        );
      }


      return sendTwiml(
        res,
        "<Say>Hi. This is CallReady practice mode.</Say>" +
          "<Say>" + escapeXml(OPTION_E_QUESTIONS[0].prompt) + "</Say>" +
          "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" + String(PHASES.start.gather.timeoutSec) + "\" speechTimeout=\"" + String(PHASES.start.gather.speechTimeoutSec) + "\"></Gather>"
      );
    }

    if (session.phase === "reason") {
            if (isDuplicateNoInputHit(session, "reason", !!userInput)) {
        console.log("OptionE duplicate no-input hit suppressed:", { callSid: callSid || "(none)", phase: "reason" });
        return sendTwiml(
          res,
          "<Say>In one sentence, what are you calling about today?</Say>" +
            "<Gather input=\"speech dtmf\" action=\"" +
            escapeXml(actionUrl) +
            "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" +
            String(PHASES.reason.gather.timeoutSec) +
            "\" speechTimeout=\"" +
            String(PHASES.reason.gather.speechTimeoutSec) +
            "\"></Gather>"
        );
      }

      if (!userInput) {
        logPhaseTransition(callSid, "reason", "reason", "silence_input");
        return handleReasonRetry(res, callSid, session, actionUrl, "silence_limit");
      }

      if (!isValidReasonInput(userInput)) {
        logPhaseTransition(callSid, "reason", "reason", "invalid_reason_input");
        return handleReasonRetry(res, callSid, session, actionUrl, "invalid_reason_limit");
      }

      session.slots = session.slots || {};
      session.slots.reason = userInput;

      session.phase = "detail";
      logPhaseTransition(callSid, "reason", "detail", "ask_detail");
      session.retries.detail = 0;
      saveSession(session);

      return sendTwiml(
        res,
        "<Say>Got it.</Say>" +
          "<Say>One more question.</Say>" +
          "<Say>" + escapeXml(OPTION_E_QUESTIONS[1].prompt) + "</Say>" +
          "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" + String(PHASES.detail.gather.timeoutSec) + "\" speechTimeout=\"" + String(PHASES.detail.gather.speechTimeoutSec) + "\"></Gather>"
      );

    }

    if (session.phase === "detail") {
            if (isDuplicateNoInputHit(session, "detail", !!userInput)) {
        console.log("OptionE duplicate no-input hit suppressed:", { callSid: callSid || "(none)", phase: "detail" });
        return sendTwiml(
          res,
          "<Say>What is one important detail they might ask you for?</Say>" +
            "<Gather input=\"speech dtmf\" action=\"" +
            escapeXml(actionUrl) +
            "\" method=\"POST\" actionOnEmptyResult=\"true\" timeout=\"" +
            String(PHASES.detail.gather.timeoutSec) +
            "\" speechTimeout=\"" +
            String(PHASES.detail.gather.speechTimeoutSec) +
            "\"></Gather>"
        );
      }

      if (!userInput) {
        logPhaseTransition(callSid, "detail", "detail", "silence_input");
        return handleDetailRetry(res, callSid, session, actionUrl, "silence_limit");
      }

      if (!isValidDetailInput(userInput)) {
        logPhaseTransition(callSid, "detail", "detail", "invalid_detail_input");
        return handleDetailRetry(res, callSid, session, actionUrl, "invalid_detail_limit");
      }

      session.slots = session.slots || {};
      session.slots.detail = userInput;

      session.phase = WRAPUP_PHASE;
      logPhaseTransition(callSid, "detail", session.phase, "got_detail");
      saveSession(session);

      return sendTwiml(
        res,
        "<Say>Okay.</Say>" +
          "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
      );
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
