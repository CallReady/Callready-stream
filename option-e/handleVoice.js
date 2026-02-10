const { getOrCreateSession, saveSession, clearSession, getCallSid } = require("./sessionStore");
const WRAPUP_PHASE = "wrapup";
const PHASES = {
  start: {
    nextOnEnter: "reason",
    gather: { timeoutSec: 3, speechTimeoutSec: 1 },
    retryLimit: 0,
  },
  reason: {
    nextOnSuccess: "wrapup",
    gather: { timeoutSec: 3, speechTimeoutSec: 1 },
    retryLimit: 3,
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

function isValidReasonInput(text) {
    const t = String(text || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Truly empty input
  if (!t) return false;

  // Single character inputs are almost never intentional reasons
  if (t.length < 2) return false;

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

function handleReasonRetry(res, callSid, session, actionUrl, limitNote) {
  session.retries = session.retries || {};
  session.retries.reason = (session.retries.reason || 0) + 1;
  saveSession(session);

  if ((session.retries && session.retries.reason ? session.retries.reason : 0) >= PHASES.reason.retryLimit) {
    session.phase = PHASES.reason.nextOnSuccess;
    logPhaseTransition(callSid, "reason", session.phase, limitNote);
    saveSession(session);

    return sendTwiml(
      res,
      "<Say>No worries. Let us stop here for now, and you can try again anytime.</Say>" +
        "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
    );
  }

  return sendTwiml(
    res,
    "<Say>I did not catch a clear reason. Try again.</Say>" +
      "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" timeout=\"" + String(PHASES.reason.gather.timeoutSec) + "\" speechTimeout=\"" + String(PHASES.reason.gather.speechTimeoutSec) + "\"></Gather>" +
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

      return sendTwiml(
        res,
        "<Say>Hi. This is CallReady practice mode.</Say>" +
          "<Say>In one sentence, what are you calling about today?</Say>" +
          "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" timeout=\"" + String(PHASES.start.gather.timeoutSec) + "\" speechTimeout=\"" + String(PHASES.start.gather.speechTimeoutSec) + "\"></Gather>" +
          "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
      );
    }

    if (session.phase === "reason") {
      if (!userInput) {
        logPhaseTransition(callSid, "reason", "reason", "silence_input");
        return handleReasonRetry(res, callSid, session, actionUrl, "silence_limit");
      }

      if (!isValidReasonInput(userInput)) {
        logPhaseTransition(callSid, "reason", "reason", "invalid_reason_input");
        return handleReasonRetry(res, callSid, session, actionUrl, "invalid_reason_limit");
      }

      session.phase = PHASES.reason.nextOnSuccess;
      logPhaseTransition(callSid, "reason", session.phase, "got_input");
      saveSession(session);

      session.slots = session.slots || {};
      session.slots.reason = userInput;

      session.phase = "detail";
      logPhaseTransition(callSid, "reason", session.phase, "ask_detail");
      saveSession(session);

      return sendTwiml(
        res,
        "<Say>Got it.</Say>" +
          "<Say>One more question.</Say>" +
          "<Say>What is one important detail they might ask you for?</Say>" +
          "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" timeout=\"" + String(PHASES.reason.gather.timeoutSec) + "\" speechTimeout=\"" + String(PHASES.reason.gather.speechTimeoutSec) + "\"></Gather>" +
          "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
      );

    }

        if (session.phase === "detail") {
      if (userInput) {
        session.slots = session.slots || {};
        session.slots.detail = userInput;
      }

      session.phase = WRAPUP_PHASE;
      logPhaseTransition(callSid, "detail", session.phase, userInput ? "got_detail" : "no_detail");
      saveSession(session);

      return sendTwiml(
        res,
        "<Say>Okay.</Say>" +
          "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
      );
    }

    if (session.phase === WRAPUP_PHASE) {
      if (callSid) clearSession(callSid);

      return sendTwiml(
        res,
        "<Say>Nice work. You can practice again anytime.</Say>" +
          "<Hangup/>"
      );
    }


    if (callSid) clearSession(callSid);
    return sendTwiml(res, "<Say>Option E reached an unknown step and will end now.</Say><Hangup/>");
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.log("OptionE error:", msg);
    return sendTwiml(res, "<Say>Sorry, an internal error occurred. Please try again.</Say><Hangup/>");
  }
}

module.exports = { handleVoiceOptionE };
