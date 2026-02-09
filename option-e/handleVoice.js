function handleVoiceOptionE(req, res) {
  res.type("text/xml");
  res.send(
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
      "<Response>\n" +
      "  <Say>Option E placeholder is active.</Say>\n" +
      "  <Hangup/>\n" +
      "</Response>"
  );
}

module.exports = { handleVoiceOptionE };
