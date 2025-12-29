const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);
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

wss.on("connection", (ws) => {
  console.log("WebSocket connected to /stream");

  let mediaCount = 0;

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const event = msg.event;

    if (event === "connected") {
      console.log("Twilio event: connected");
      return;
    }

    if (event === "start") {
      console.log("Twilio event: start");
      console.log("streamSid:", msg.start.streamSid);
      console.log("callSid:", msg.start.callSid);
      return;
    }

    if (event === "media") {
      mediaCount += 1;
      if (mediaCount % 50 === 0) {
        console.log("Twilio event: media packets received:", mediaCount);
      }
      return;
    }

    if (event === "stop") {
      console.log("Twilio event: stop");
      return;
    }
  });

  ws.on("close", () => {
    console.log("WebSocket closed");
  });

  ws.on("error", (err) => {
    console.log("WebSocket error:", err.message);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Listening on port " + port);
});
