const { getOrCreateSession, saveSession, clearSession, getCallSid } = require("./sessionStore");

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
      session.phase = "reason";
      session.retries = {};
      session.retries.reason = 0;
      saveSession(session);

      return sendTwiml(
        res,
        "<Say>Hi. This is CallReady practice mode.</Say>" +
          "<Say>In one sentence, what are you calling about today?</Say>" +
          "<Pause length=\"3\"/>" +
          "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" timeout=\"6\" speechTimeout=\"auto\"></Gather>" +
          "<Say>I did not catch that.</Say>" +
          "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
      );
    }

    if (session.phase === "reason") {
      if (!userInput) {
        session.retries = session.retries || {};
        session.retries.reason = (session.retries.reason || 0) + 1;
        saveSession(session);

        if ((session.retries && session.retries.reason ? session.retries.reason : 0) >= 3) {
          session.phase = "wrapup";
          saveSession(session);

          return sendTwiml(
            res,
            "<Say>No worries. Let us stop here for now, and you can try again anytime.</Say>" +
              "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
          );
        }

        return sendTwiml(
          res,
          "<Say>I did not hear anything. Try again.</Say>" +
          "<Pause length=\"3\"/>" +
            "<Gather input=\"speech dtmf\" action=\"" + escapeXml(actionUrl) + "\" method=\"POST\" timeout=\"6\" speechTimeout=\"auto\"></Gather>" +
            "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
        );
      }

      session.phase = "wrapup";
      saveSession(session);

      return sendTwiml(
        res,
        "<Say>You said: " + escapeXml(userInput) + ".</Say>" +
          "<Say>Okay. We will wrap up the practice call now.</Say>" +
          "<Redirect method=\"POST\">" + escapeXml(actionUrl) + "</Redirect>"
      );
    }


    if (session.phase === "wrapup") {
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
