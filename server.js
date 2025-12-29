const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const app = express();
app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get("/", (req, res) => {
  res.type("text/plain").send("CallReady stream server is running.");
});

// Twilio hits this when a call comes in.
// We start a live audio stream to /stream.
// No <Say> here, because we want the AI to speak first.
app.post("/twiml", (req, res) => {
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
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

function sendJson(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

wss.on("connection", (twilioWs) => {
  let streamSid = null;
  let openaiWs = null;
  let openaiReady = false;

  console.log("Twilio WebSocket connected");

  function sendToTwilio(obj) {
    sendJson(twilioWs, obj);
  }

  function connectToOpenAI() {
    // This is the OpenAI Realtime WebSocket endpoint.
    // The model name used here should match what your account supports for realtime.
    const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";

    openaiWs = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    openaiWs.on("open", () => {
      console.log("OpenAI WebSocket connected");

      const opening =
        "Welcome to CallReady. This is a safe place to practice talking on the phone without pressure. " +
        "I’m an AI agent, and I’ll respond the way a real person would, so there’s no need to feel self conscious. " +
        "What kind of call would you like to practice today, for example calling a doctor’s office, or would you like me to pick an easy scenario to start?";

      const sessionUpdate = {
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "alloy",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: { type: "server_vad" },
          instructions:
            "You are CallReady, a calm and friendly AI phone conversation practice partner for teens and young adults. " +
            "At the very start of the call, you must say exactly this opening, once, and only once: " +
            `"${opening}" ` +
            "After the opening, behave like a real human on the phone. " +
            "Keep responses natural and concise. Ask one clear question at a time. " +
            "Adapt to the caller’s answers. Do not repeat the opening. " +
            "Do not say 'you can respond now'. " +
            "If the caller chooses a doctor appointment scenario, roleplay as a clinic receptionist and naturally gather: reason, day, time, name, phone number. " +
            "Confirm details before ending the call."
        }
      };

      sendJson(openaiWs, sessionUpdate);
    });

    openaiWs.on("message", (data) => {
      const msg = safeJsonParse(data);
      if (!msg) return;

      if (msg.type === "session.created" || msg.type === "session.updated") {
        openaiReady = true;

        // Make the AI speak first immediately.
        sendJson(openaiWs, {
          type: "response.create",
          response: {
            modalities: ["audio", "text"]
          }
        });
        return;
      }

      // Forward OpenAI audio back to Twilio
      if (msg.type === "response.audio.delta") {
        if (!streamSid) return;

        sendToTwilio({
          event: "media",
          streamSid,
          media: { payload: msg.delta }
        });
        return;
      }

      if (msg.type === "response.completed") {
        return;
      }
    });

    openaiWs.on("close", () => {
      console.log("OpenAI WebSocket closed");
      openaiReady = false;
    });

    openaiWs.on("error", (err) => {
      console.log(
        "OpenAI WebSocket error:",
        err && err.message ? err.message : "unknown"
      );
      openaiReady = false;
    });
  }

  if (!OPENAI_API_KEY) {
    console.log("Missing OPENAI_API_KEY, cannot connect to OpenAI");
  } else {
    connectToOpenAI();
  }

  twilioWs.on("message", (data) => {
    const msg = safeJsonParse(data);
    if (!msg) return;

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      console.log("Twilio start streamSid:", streamSid);
      return;
    }

    if (msg.event === "media") {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) return;
      if (!openaiReady) return;

      // Forward caller audio to OpenAI
      sendJson(openaiWs, {
        type: "input_audio_buffer.append",
        audio: msg.media.payload
      });
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
    console.log(
      "Twilio WebSocket error:",
      err && err.message ? err.message : "unknown"
    );
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Listening on port " + port);
});
