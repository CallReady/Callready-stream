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

  let silenceTimer = null;
  let helpUsedForThisPause = false;

  let lastAiAudioTime = 0;
  let aiSpeaking = false;

  console.log("Twilio WebSocket connected");

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function startSilenceTimer() {
    clearSilenceTimer();

    silenceTimer = setTimeout(() => {
      if (!openaiReady || !openaiWs) return;
      if (helpUsedForThisPause) return;

      helpUsedForThisPause = true;

      sendJson(openaiWs, {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            "The caller has been quiet. Gently ask if they want help thinking of what to say. " +
            "Offer exactly two short example phrases they could use. " +
            "Then repeat your last question in a simpler way and stop talking to wait."
        }
      });
    }, 6000);
  }

  function aiFinishedSpeakingCheck() {
    const now = Date.now();

    if (aiSpeaking && now - lastAiAudioTime > 1200) {
      aiSpeaking = false;
      helpUsedForThisPause = false;
      startSilenceTimer();
    }
  }

  function connectToOpenAI() {
    openaiWs = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-realtime",
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "OpenAI-Beta": "realtime=v1"
        }
      }
    );

    openaiWs.on("open", () => {
      openaiReady = false;

      const opening =
        "Welcome to CallReady. A safe place to practice real phone calls before they matter. " +
        "Quick note, this is a beta release, so you might notice an occasional glitch. " +
        "I’m an AI agent who talks with you like a real person would, so there’s no reason to feel self conscious. " +
        "Do you want to choose a type of call to practice, like calling a doctor’s office, " +
        "or would you like me to pick an easy scenario to start?";

      sendJson(openaiWs, {
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "marin",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: { type: "server_vad" },
          instructions:
            "You are CallReady, a supportive AI phone conversation practice partner for teens and young adults. " +
            "Ask one question at a time and then wait. " +
            "If the caller is quiet, offer help once and then wait. " +
            "Never ask for real personal information without saying they can make it up. " +
            "Never discuss sexual topics. " +
            "If self harm language appears, stop roleplay and encourage help including 988 in the US. " +
            "At the very start of the call, say exactly this opening once and only once: " +
            `"${opening}" ` +
            "Only say 'ring ring' when a practice scenario actually begins."
        }
      });
    });

    openaiWs.on("message", (data) => {
      const msg = safeJsonParse(data);
      if (!msg) return;

      if (msg.type === "session.created" || msg.type === "session.updated") {
        openaiReady = true;

        sendJson(openaiWs, {
          type: "response.create",
          response: { modalities: ["audio", "text"] }
        });
        return;
      }

      if (msg.type === "response.audio.delta") {
        aiSpeaking = true;
        lastAiAudioTime = Date.now();
        clearSilenceTimer();

        sendJson(twilioWs, {
          event: "media",
          streamSid,
          media: { payload: msg.delta }
        });
      }
    });

    setInterval(aiFinishedSpeakingCheck, 500);
  }

  connectToOpenAI();

  twilioWs.on("message", (data) => {
    const msg = safeJsonParse(data);
    if (!msg) return;

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      helpUsedForThisPause = false;
      return;
    }

    if (msg.event === "media") {
      clearSilenceTimer();
      helpUsedForThisPause = false;

      if (!openaiReady || !openaiWs) return;

      sendJson(openaiWs, {
        type: "input_audio_buffer.append",
        audio: msg.media.payload
      });
    }
  });

  twilioWs.on("close", () => {
    clearSilenceTimer();
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Listening on port " + port);
});
