const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const app = express();
app.use(express.urlencoded({ extended: false }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

process.on("uncaughtException", (err) => {
  console.log("uncaughtException:", err && err.message ? err.message : err);
});

process.on("unhandledRejection", (err) => {
  console.log("unhandledRejection:", err && err.message ? err.message : err);
});

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
  let openaiConnecting = false;

  let aiSpeaking = false;
  let awaitingUser = false;

  let silenceTimer = null;
  let silenceHelpUsed = false;

  let warningTimer = null;
  let hardStopTimer = null;
  let timeWarningRequested = false;

  let reconnectAttempts = 0;

  console.log("Twilio WebSocket connected");

  function clearSilenceTimer() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  function startSilenceTimer() {
    clearSilenceTimer();

    silenceTimer = setTimeout(() => {
      if (!openaiReady || !openaiWs) return;
      if (!awaitingUser) return;
      if (silenceHelpUsed) return;

      silenceHelpUsed = true;
      awaitingUser = false;

      sendJson(openaiWs, {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            "The caller is quiet. Ask kindly if they want help thinking of what to say. " +
            "Offer exactly two short example phrases they could use. " +
            "Then repeat your last question in a simpler way and wait."
        }
      });
    }, 7000);
  }

  function markAiFinishedSpeaking() {
    aiSpeaking = false;
    awaitingUser = true;
    startSilenceTimer();

    if (timeWarningRequested) {
      timeWarningRequested = false;
      sendJson(openaiWs, {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            "Quick time check, we have about 15 seconds left. Wrap up the scenario now. Then do confidence mirror and brief feedback. Then invite them to call again or visit callready.live."
        }
      });
    }
  }

  function requestTimeWarningWhenSafe() {
    if (!openaiReady || !openaiWs) return;

    if (aiSpeaking) {
      timeWarningRequested = true;
      return;
    }

    sendJson(openaiWs, {
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions:
          "Quick time check, we have about 15 seconds left. Wrap up the scenario now. Then do confidence mirror and brief feedback. Then invite them to call again or visit callready.live."
      }
    });
  }

  function connectToOpenAI() {
    if (!OPENAI_API_KEY) return;
    if (openaiConnecting) return;

    openaiConnecting = true;

    openaiWs = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime", {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    openaiWs.on("open", () => {
      openaiConnecting = false;
      openaiReady = false;
      reconnectAttempts = 0;

      const opening =
        "Welcome to CallReady. A safe place to practice real phone calls before they matter. " +
        "Quick note, this is a beta release, so you might notice an occasional glitch. " +
        "I’m an AI agent who talks with you like a real person would, so there’s no reason to feel self conscious. " +
        "Do you want to choose a type of call to practice, like calling a doctor’s office, " +
        "or would you like me to pick an easy scenario to start?";

      const sessionUpdate = {
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "marin",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: { type: "server_vad" },

          instructions:
            "You are CallReady, a supportive AI phone conversation practice partner for teens and young adults. " +
            "Keep everything calm, human, and low pressure. " +

            "Ask one question at a time. After asking, stop and wait. " +
            "If the caller is quiet, offer help once, then wait. " +

            "Never ask for real personal information without saying they can make it up. " +
            "Never discuss sexual or inappropriate topics. " +
            "If the caller expresses self harm thoughts, stop roleplay and encourage help, including 988 in the US. " +

            "At the very start of the call, say this opening once and only once: " +
            `"${opening}" ` +

            "Only use 'ring ring' when a practice scenario actually begins, not in the opening. " +

            "When the scenario ends, briefly summarize what the caller did well, give one gentle tip, " +
            "then ask if they want to try again or a different scenario. " +
            "End by inviting them to call again or visit callready.live."
        }
      };

      sendJson(openaiWs, sessionUpdate);
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

        warningTimer = setTimeout(requestTimeWarningWhenSafe, 285000);
        hardStopTimer = setTimeout(() => {
          if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
          if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
        }, 300000);
        return;
      }

      if (msg.type === "response.audio.delta") {
        aiSpeaking = true;
        awaitingUser = false;
        clearSilenceTimer();

        sendJson(twilioWs, {
          event: "media",
          streamSid,
          media: { payload: msg.delta }
        });
      }

      if (msg.type === "response.audio.done" || msg.type === "response.done") {
        markAiFinishedSpeaking();
      }
    });
  }

  connectToOpenAI();

  twilioWs.on("message", (data) => {
    const msg = safeJsonParse(data);
    if (!msg) return;

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      silenceHelpUsed = false;
    }

    if (msg.event === "media") {
      awaitingUser = false;
      clearSilenceTimer();
      silenceHelpUsed = false;

      sendJson(openaiWs, {
        type: "input_audio_buffer.append",
        audio: msg.media.payload
      });
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Listening on port " + port);
});
