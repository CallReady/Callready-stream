const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);

// This WebSocket server will receive Twilio Media Streams events.
const wss = new WebSocket.Server({ server });

app.get("/", (req, res) => {
  res.type("text/plain").send("CallReady stream server is running.");
});

app.post("/twiml", (req, res) => {
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say>Thank you for calling CallReady.</Say>` +
    `<Connect>` +
    `<Stream url="wss://callready-stream.onrender.com/stream" />` +
    `</Connect>` +
    `</Response>`;

  res.type("text/xml").send(twiml);
});

wss.on("connection", (ws, req) => {
  console.log("WebSocket connected to /stream");

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.log("Non JSON message received");
      return;
    }

    const event = msg.event || "unknown";

    if (event === "connected") {
      console.log("Twilio event: connected");
      return;
    }

    if (event === "start") {
      const streamSid = msg.start && msg.start.streamSid ? msg.start.streamSid : "";
      const callSid = msg.start && msg.start.callSid ? msg.start.callSid : "";
      console.log("Twilio event: start");
      console.log("streamSid: " + streamSid);
      console.log("callSid: " + callSid);
      return;
    }

    if (event === "media") {
      const track = msg.media && msg.media.track ? msg.media.track : "";
      const len = msg.media && msg.media.payload ? msg.media.payload.length : 0;
      console.log("Twilio event: media track=" + track + " payloadLength=" + len);
      return;
    }

    if (event === "stop") {
      console.log("Twilio event: stop");
      return;
    }

    console.log("Twilio event: " + event);
  });

  ws.on("close", () => {
    console.log("WebSocket closed");
  });

  ws.on("error", (err) => {
    console.log("WebSocket error: " + (err && err.message ? err.message : "unknown"));
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Listening on port " + port);
});
