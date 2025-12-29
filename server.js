const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.type("text/plain").send("CallReady stream server is running.");
});

// Twilio will request this URL when a call comes in.
// It returns TwiML that tells Twilio to start streaming audio to our WebSocket URL.
app.post("/twiml", (req, res) => {
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say>Connecting you now.</Say>` +
    `<Connect>` +
    `<Stream url="wss://callready-stream.onrender.com/stream" />` +
    `</Connect>` +
    `</Response>`;

  res.type("text/xml").send(twiml);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Listening on port " + port);
});
