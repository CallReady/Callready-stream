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
  // Prefer your configured public URL if present.
  const envUrl = process.env.PUBLIC_BASE_URL;
  if (envUrl && String(envUrl).trim()) return String(envUrl).replace(/\/+$/, "");

  // Fallback to the request host.
  const host = req && req.headers ? req.headers.host : "";
  if (host) return "https://" + host;

  // Last resort fallback.
  return "https://callready-stream.onrender.com";
}

function handleVoiceOptionE(req, res) {
  try {
    console.log("OptionE hit:", {
      path: req && req.path,
      query: req && req.query,
      hasBody: !!(req && req.body),
    });

    const step = (req && req.query && req.query.cr_step ? req.query.cr_step : "start").toString();
    const triesRaw = (req && req.query && req.query.cr_try ? req.query.cr_try : "0").toString();
    const tries = parseInt(triesRaw, 10) || 0;

    const speech = (req && req.body && req.body.SpeechResult) ? String(req.body.SpeechResult).trim() : "";
    const digits = (req && req.body && req.body.Digits) ? String(req.body.Digits).trim() : "";
    const userInput = (speech || digits).trim();

    const basePath = req && req.path ? req.path : "/voice-test-medical";
    const baseUrl = getBaseUrl(req);

    if (step === "start") {
      const actionUrl = baseUrl + basePath + "?cr_step=reason&cr_try=0";
      const actionUrlXml = actionUrl.replace(/&/g, "&amp;");


      return sendTwiml(
        res,
        "<Say>Hi. This is CallReady practice mode.</Say>" +
          "<Say>In one sentence, what are you calling about today?</Say>" +
          "<Gather input=\"speech dtmf\" action=\"" + actionUrlXml + "\" method=\"POST\" timeout=\"6\" speechTimeout=\"auto\"></Gather>" +
          "<Say>I did not catch that.</Say>" +
          "<Redirect method=\"POST\">" + actionUrlXml + "</Redirect>"
      );
    }

    if (step === "reason") {
      if (!userInput) {
        if (tries >= 2) {
          return sendTwiml(
            res,
            "<Say>No worries. Let us stop here for now, and you can try again anytime.</Say>" +
              "<Hangup/>"
          );
        }

        const nextTry = tries + 1;
        const actionUrl = baseUrl + basePath + "?cr_step=reason&cr_try=" + String(nextTry);
        const actionUrlXml = actionUrl.replace(/&/g, "&amp;");


        return sendTwiml(
          res,
          "<Say>I did not hear anything. Try again.</Say>" +
            "<Gather input=\"speech dtmf\" action=\"" + actionUrlXml + "\" method=\"POST\" timeout=\"6\" speechTimeout=\"auto\"></Gather>" +
            "<Say>I still did not catch that.</Say>" +
            "<Redirect method=\"POST\">" + actionUrlXml + "</Redirect>"
        );
      }

      return sendTwiml(
        res,
        "<Say>You said: " + escapeXml(userInput) + ".</Say>" +
          "<Say>Great. That confirms the Option E state flow is working.</Say>" +
          "<Hangup/>"
      );
    }

    return sendTwiml(
      res,
      "<Say>Option E reached an unknown step and will end now.</Say><Hangup/>"
    );
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.log("OptionE error:", msg);
    return sendTwiml(
      res,
      "<Say>Sorry, an internal error occurred. Please try again.</Say><Hangup/>"
    );
  }
}

module.exports = { handleVoiceOptionE };
