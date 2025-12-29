const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.log("Missing OPENAI_API_KEY environment variable");
}

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
    `<Pause length="1" />` +
    `<Connect>` +
    `<Stream url="wss://callready-stream.onrender.com/stream" />` +
    `</Connect>` +
    `</Response>`;

  res.type("text/xml").send(twiml);
});

function safeJsonParse(data) {
  try {
    return JSON.parse(data.toString());
  } catch {
    return null;
  }
}

wss.on("connection", (twilioWs) => {
  let streamSid = null;
  let openaiWs = null;
  let openaiReady = false;

  console.log("Twilio WebSocket connected");

  function sendToTwilio(obj) {
    if (twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(JSON.stringify(obj));
    }
  }

  function clearTwilioAudioBuffer() {
    if (!streamSid) return;
    sendToTwilio({ event: "clear", streamSid });
  }

  function connectToOpenAI() {
    const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

    openaiWs = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    openaiWs.on("open", () => {
      console.log("OpenAI Realtime WebSocket connected");

      // Configure the session to match Twilio Media Streams audio (mulaw 8k).
      // Turn detection makes the AI wait until the caller stops talking.
      const sessionUpdate = {
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "alloy",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: { type: "server_vad" },
          instructions:
            "You are CallReady, a friendly phone conversation practice partner for teens and young adults who feel anxious on the phone. " +
            "Sound natural and human. Keep responses short. Ask one clear question at a time. " +
            "If the caller is booking an appointment, act like a real clinic receptionist and gather: reason, preferred day, preferred time, name, phone number. " +
            "Confirm details before ending. Do not say 'you can respond now'."
        }
      };

      openaiWs.send(JSON.stringify(sessionUpdate));
    });

    openaiWs.on("message", (data) => {
      const msg = safeJsonParse(data);
      if (!msg) return;

      if (msg.type === "session.created" || msg.type === "session.updated") {
        openaiReady = true;
        return;
      }

      // When OpenAI produces audio, forward it to Twilio.
      // OpenAI audio comes as base64 chunks. Twilio expects base64 mulaw payloads.
      if (msg.type === "response.audio.delta") {
        if (!streamSid) return;

        sendToTwilio({
          event: "media",
          streamSid,
          media: { payload: msg.delta }
        });
        return;
      }

      // Optional: helpful for debugging.
      if (msg.type === "response.text.delta") {
        process.stdout.write(msg.delta);
        return;
      }

      // If OpenAI ends a response, print a newline for readability.
      if (msg.type === "response.completed") {
        process.stdout.write("\n");
        return;
      }
    });

    openaiWs.on("close", () => {
      console.log("OpenAI WebSocket closed");
      openaiReady = false;
    });

    openaiWs.on("error", (err) => {
      console.log("OpenAI WebSocket error:", err && err.message ? err.message : "unknown");
      openaiReady = false;
    });
  }

  connectToOpenAI();

  twilioWs.on("message", (data) => {
    const msg = safeJsonParse(data);
    if (!msg) return;

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      console.log("Twilio start, streamSid:", streamSid);

      // Clear any buffered audio at the start.
      clearTwilioAudioBuffer();
      return;
    }

    if (msg.event === "media") {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) return;
      if (!openaiReady) return;

      // Forward caller audio to OpenAI.
      // Twilio sends base64 mulaw chunks in msg.media.payload
      openaiWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: msg.media.payload
        })
      );
      return;
    }

    if (msg.event === "stop") {
      console.log("Twilio stop");
      return;
    }
  });

  twilioWs.on("close", () => {
    console.log("Twilio WebSocket closed");
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });

  twilioWs.on("error", (err) => {
    console.log("Twilio WebSocket error:", err && err.message ? err.message : "unknown");
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Listening on port " + port);
});
