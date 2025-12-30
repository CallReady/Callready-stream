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

  // Speaking detection based on audio deltas timing
  let aiSpeaking = false;
  let lastAiAudioAt = 0;

  // Silence helper
  let awaitingUser = false;
  let silenceTimer = null;
  let silenceHelpUsed = false;

  // 5 minute limit timers
  let warningTimer = null;
  let hardStopTimer = null;
  let timeWarningPending = false;

  let reconnectAttempts = 0;

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }

  function forceAiTurn(extraInstructions) {
    if (!openaiReady || !openaiWs) return;

    sendJson(openaiWs, {
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        max_output_tokens: 140,
        instructions:
          (extraInstructions ? extraInstructions + " " : "") +
          "Important: ask at most one question in this response. " +
          "End the response immediately after that single question."
      }
    });
  }

  function startAwaitingUser() {
    awaitingUser = true;
    silenceHelpUsed = false;

    clearSilenceTimer();

    silenceTimer = setTimeout(() => {
      if (!openaiReady || !openaiWs) return;
      if (!awaitingUser) return;
      if (silenceHelpUsed) return;

      silenceHelpUsed = true;
      awaitingUser = false;

      forceAiTurn(
        "The caller has been quiet. Ask: 'Want a little help thinking of what to say?' " +
          "Then offer exactly two short example phrases they could say. " +
          "Then repeat your last question in a simpler way. " +
          "Stop and wait."
      );
    }, 6500);
  }

  function requestTimeWarningWhenSafe() {
    if (!openaiReady || !openaiWs) return;

    if (aiSpeaking) {
      timeWarningPending = true;
      return;
    }

    forceAiTurn(
      "Quick time check, we have about 15 seconds left. Wrap up the scenario now. " +
        "Then do confidence mirror and brief feedback. " +
        "Then invite them to call again or visit callready.live."
    );
  }

  function aiFinishWatcherTick() {
    if (!openaiReady) return;

    const now = Date.now();
    if (aiSpeaking && now - lastAiAudioAt > 1100) {
      aiSpeaking = false;

      // AI turn ended, now we wait for caller
      startAwaitingUser();

      // If time warning was waiting, deliver it now
      if (timeWarningPending) {
        timeWarningPending = false;
        forceAiTurn(
          "Quick time check, we have about 15 seconds left. Wrap up the scenario now. " +
            "Then do confidence mirror and brief feedback. " +
            "Then invite them to call again or visit callready.live."
        );
      }
    }
  }

  function connectToOpenAI() {
    if (!OPENAI_API_KEY) {
      console.log("Missing OPENAI_API_KEY");
      return;
    }
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

      sendJson(openaiWs, {
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "marin",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: { type: "server_vad" },
          instructions:
            "Language: you must speak only in American English at all times. Never switch languages. " +
            "If the caller uses another language, politely continue in English. " +

            "You are CallReady, a supportive AI phone conversation practice partner for teens and young adults. " +
            "Keep everything calm, human, upbeat, and low pressure. " +

            "Turn taking is critical. Ask exactly one question per turn, then stop talking and wait. " +
            "Never ask a second question until the caller answers. " +

            "If the caller goes quiet, you may offer help once: ask if they want help, give two short example phrases, " +
            "then repeat your last question, and wait. " +

            "Privacy: never ask for real personal information unless you also say they can make it up for practice. " +
            "Content boundaries: never discuss sexual or inappropriate topics for teens. Redirect to a safe scenario. " +
            "Self harm safety: if the caller expresses self harm thoughts, stop roleplay and encourage help including 988 in the US. " +

            "Only use 'ring ring' when a practice scenario begins, not in the CallReady opening. " +

            "At the very start of the call, say this opening once and only once: " +
            `"${opening}" ` +

            "When a scenario ends, do a brief confidence mirror (one sentence naming what the caller did well), " +
            "one gentle tip, then ask if they want to try again or a different scenario. " +
            "If time is up, invite them to call again or visit callready.live for unlimited use, texts with feedback, and remembering where they left off."
        }
      });
    });

    const aiFinishWatcher = setInterval(aiFinishWatcherTick, 400);

    openaiWs.on("message", (data) => {
      const msg = safeJsonParse(data);
      if (!msg) return;

      if (msg.type === "session.created" || msg.type === "session.updated") {
        openaiReady = true;

        // Controlled opening turn
        forceAiTurn(null);

        // 5 minute timers
        if (warningTimer) clearTimeout(warningTimer);
        if (hardStopTimer) clearTimeout(hardStopTimer);

        warningTimer = setTimeout(() => requestTimeWarningWhenSafe(), 285000);
        hardStopTimer = setTimeout(() => {
          try {
            if (twilioWs && twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
          } catch {}
          try {
            if (openaiWs && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
          } catch {}
        }, 300000);

        return;
      }

      if (msg.type === "response.audio.delta") {
        aiSpeaking = true;
        lastAiAudioAt = Date.now();

        awaitingUser = false;
        clearSilenceTimer();

        if (streamSid) {
          sendJson(twilioWs, {
            event: "media",
            streamSid,
            media: { payload: msg.delta }
          });
        }
        return;
      }
    });

    openaiWs.on("close", () => {
      clearInterval(aiFinishWatcher);

      openaiReady = false;
      openaiConnecting = false;
      aiSpeaking = false;
      awaitingUser = false;
      clearSilenceTimer();

      if (twilioWs.readyState === WebSocket.OPEN && reconnectAttempts < 2) {
        reconnectAttempts += 1;
        setTimeout(() => connectToOpenAI(), 800);
      }
    });

    openaiWs.on("error", (err) => {
      console.log("OpenAI WebSocket error:", err && err.message ? err.message : "unknown");
    });
  }

  connectToOpenAI();

  twilioWs.on("message", (data) => {
    const msg = safeJsonParse(data);
    if (!msg) return;

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;

      // Reset per call state
      aiSpeaking = false;
      awaitingUser = false;
      clearSilenceTimer();
      silenceHelpUsed = false;
      timeWarningPending = false;

      return;
    }

    if (msg.event === "media") {
      // Caller is talking
      awaitingUser = false;
      clearSilenceTimer();
      silenceHelpUsed = false;

      if (!openaiReady || !openaiWs) return;

      sendJson(openaiWs, {
        type: "input_audio_buffer.append",
        audio: msg.media.payload
      });

      return;
    }
  });

  twilioWs.on("close", () => {
    clearSilenceTimer();
    if (warningTimer) clearTimeout(warningTimer);
    if (hardStopTimer) clearTimeout(hardStopTimer);

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
```0
