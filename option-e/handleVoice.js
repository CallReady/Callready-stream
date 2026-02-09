function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function handleVoiceOptionE(req, res) {
  res.type("text/xml");

  const step = (req.query.cr_step || "start").toString();
  const tries = parseInt((req.query.cr_try || "0").toString(), 10) || 0;

  const speech = (req.body && req.body.SpeechResult) ? String(req.body.SpeechResult).trim() : "";
  const digits = (req.body && req.body.Digits) ? String(req.body.Digits).trim() : "";
  const userInput = (speech || digits).trim();

  // Use the same endpoint Twilio called, but add our state params.
  const basePath = req.path; // e.g. /voice-test-medical

  if (step === "start") {
    const actionUrl = basePath + "?cr_step=reason&cr_try=0";
    const twiml =
      "<Response>" +
        "<Say>Hi. This is CallReady practice mode.</Say>" +
        "<Say>In one sentence, what are you calling about today?</Say>" +
        "<Gather input=\"speech dtmf\" action=\"" + actionUrl + "\" method=\"POST\" timeout=\"6\" speechTimeout=\"auto\" />" +
        "<Say>I did not catch that.</Say>" +
        "<Redirect method=\"POST\">" + actionUrl + "</Redirect>" +
      "</Response>";

    return res.send(twiml);
  }

  if (step === "reason") {
    if (!userInput) {
      if (tries >= 2) {
        const twiml =
          "<Response>" +
            "<Say>No worries. Let us stop here for now, and you can try again anytime.</Say>" +
            "<Hangup/>" +
          "</Response>";
        return res.send(twiml);
      }

      const nextTry = tries + 1;
      const actionUrl = basePath + "?cr_step=reason&cr_try=" + String(nextTry);

      const twiml =
        "<Response>" +
          "<Say>I did not hear anything. Try again.</Say>" +
          "<Gather input=\"speech dtmf\" action=\"" + actionUrl + "\" method=\"POST\" timeout=\"6\" speechTimeout=\"auto\" />" +
          "<Say>I still did not catch that.</Say>" +
          "<Redirect method=\"POST\">" + actionUrl + "</Redirect>" +
        "</Response>";

      return res.send(twiml);
    }

    const twiml =
      "<Response>" +
        "<Say>You said: " + escapeXml(userInput) + ".</Say>" +
        "<Say>Great. That confirms the Option E state flow is working.</Say>" +
        "<Hangup/>" +
      "</Response>";

    return res.send(twiml);
  }

  // Fallback for any unknown step
  const twiml =
    "<Response>" +
      "<Say>Option E reached an unknown step and will end now.</Say>" +
      "<Hangup/>" +
    "</Response>";
  return res.send(twiml);
}

module.exports = { handleVoiceOptionE };
