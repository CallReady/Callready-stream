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
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    "<Pause length=\"1\" />" +
    "<Connect>" +
    "<Stream url=\"wss://callready-stream.onrender.com/stream\" />" +
    "</Connect>" +
    "</Response>";

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

  let openingSent = false;

  // When true, we are waiting for caller input
  let awaitingUser = false;

  // Silence help
  let silenceTimer = null;
  let silenceHelpUsed = false;

  // Prevent double responses for one user utterance
  let pendingUserResponse = false;

  // 5 minute limit
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

      sendJson(openaiWs, {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          max_output_tokens: 170,
          instructions:
            "Speak only in American English. " +
            "The caller is quiet. Ask kindly if they want help thinking of what to say. " +
            "Offer exactly two short example phrases they could use. " +
            "Then repeat your last question in a simpler way. " +
            "Ask exactly one question, then stop talking and wait."
        }
      });
    }, 7000);
  }

  function sendOpeningOnce() {
    if (!openaiReady || !openaiWs) return;
    if (openingSent) return;

    openingSent = true;
    awaitingUser = false;
    clearSilenceTimer();

    const openingText =
      "Welcome to CallReady. A safe place to practice real phone calls before they matter. " +
      "Quick note, this is a beta release, so you might notice an occasional glitch. " +
      "I am an AI agent who talks with you like a real person would, so there is no reason to feel self conscious. " +
      "Do you want to choose a type of call to practice, like calling a doctor's office, " +
      "or would you like me to pick an easy scenario to start?";

    sendJson(openaiWs, {
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        max_output_tokens: 260,
        instructions:
          "Speak only in American English. Never switch languages. " +
          "Say the following opening exactly as written. Do not add anything. " +
          "After the final question, stop speaking and wait. " +
          "Opening: " + openingText
      }
    });
  }

  function requestTimeWarningWhenSafe() {
    if (!openaiReady || !openaiWs) return;

    // If we are not awaiting user, let the next response.done trigger it
    timeWarningPending = true;

    if (awaitingUser) {
      // If we are waiting already, we can deliver it immediately
      timeWarningPending = false;
      awaitingUser = false;
      clearSilenceTimer();

      sendJson(openaiWs, {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          max_output_tokens: 160,
          instructions:
            "Speak only in American English. " +
            "Quick time check, we have about 15 seconds left. Wrap up the scenario now. " +
            "Then do confidence mirror and brief feedback. " +
            "Then invite them to call again or visit callready.live."
        }
      });
    }
  }

  function createModelReplyAfterUser() {
    if (!openaiReady || !openaiWs) return;

    awaitingUser = false;
    clearSilenceTimer();

    sendJson(openaiWs, {
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        max_output_tokens: 190,
        instructions:
          "Speak only in American English. " +
          "You are CallReady. Continue the roleplay naturally. " +
          "Do not assume anything the caller did not say. " +
          "Ask exactly one relevant question, then stop talking and wait. " +
          "Never ask for real personal information unless you also say they can make it up for practice. " +
          "Never discuss sexual or inappropriate topics for teens. " +
          "If the caller expresses self harm thoughts, stop roleplay and encourage help including 988 in the US."
      }
    });
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
        Authorization: "Bearer " + OPENAI_API_KEY,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    openaiWs.on("open", () => {
      openaiConnecting = false;
      openaiReady = false;
      reconnectAttempts = 0;

      openingSent = false;
      awaitingUser = false;
      silenceHelpUsed = false;
      pendingUserResponse = false;
      timeWarningPending = false;
      clearSilenceTimer();

      const systemInstructions =
        "Language lock: You must speak only in American English at all times. Never switch languages. " +
        "If the caller uses another language, politely continue in English. " +

        "You are CallReady, a supportive AI phone conversation practice partner for teens and young adults. " +
        "Keep everything calm, human, upbeat, and low pressure. " +

        "Critical: Never assume the caller spoke. Never move forward unless you actually heard them. " +
        "Ask exactly one question per turn, then stop talking and wait. " +

        "If the caller goes quiet, you may offer help once: ask if they want help, give two short example phrases, " +
        "then repeat your last question, and wait. " +

        "Privacy: never ask for real personal information unless you also say they can make it up for practice. " +
        "Content boundaries: never discuss sexual or inappropriate topics for teens. Redirect to a safe scenario. " +
        "Self harm safety: if the caller expresses self harm thoughts, stop roleplay and encourage help including 988 in the US. " +

        "Only use 'ring ring' when a practice scenario begins, not in the CallReady opening. " +

        "When a scenario ends, do a brief confidence mirror (one sentence naming what the caller did well), " +
        "one gentle tip, then ask if they want to try again or a different scenario. " +
        "If time is up, invite them to call again or visit callready.live.";

      sendJson(openaiWs, {
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          voice: "marin",
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: {
            type: "server_vad",
            threshold: 0.6,
            prefix_padding_ms: 300,
            silence_duration_ms: 650,
            create_response: false,
            interrupt_response: false
          },
          instructions: systemInstructions
        }
      });
    });

    openaiWs.on("message", (data) => {
      const msg = safeJsonParse(data);
      if (!msg) return;

      if (msg.type === "session.created" || msg.type === "session.updated") {
        openaiReady = true;

        sendOpeningOnce();

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

      // Forward AI audio to Twilio
      if (msg.type === "response.audio.delta") {
        awaitingUser = false;
        clearSilenceTimer();

        if (streamSid) {
          sendJson(twilioWs, {
            event: "media",
            streamSid: streamSid,
            media: { payload: msg.delta }
          });
        }
        return;
      }

      // When AI finishes a turn, start waiting for user
      if (msg.type === "response.done") {
        // If we owe the time warning, do it now after a clean stop
        if (timeWarningPending) {
          timeWarningPending = false;
          sendJson(openaiWs, {
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              max_output_tokens: 160,
              instructions:
                "Speak only in American English. " +
                "Quick time check, we have about 15 seconds left. Wrap up the scenario now. " +
                "Then do confidence mirror and brief feedback. " +
                "Then invite them to call again or visit callready.live."
            }
          });
          return;
        }

        startAwaitingUser();
        return;
      }

      // VAD signals: user finished speaking
      if (msg.type === "input_audio_buffer.speech_stopped" || msg.type === "input_audio_buffer.committed") {
        // Debounce, only create one reply per user turn
        if (pendingUserResponse) return;
        pendingUserResponse = true;

        setTimeout(() => {
          pendingUserResponse = false;
        }, 400);

        createModelReplyAfterUser();
        return;
      }
    });

    openaiWs.on("close", () => {
      openaiReady = false;
      openaiConnecting = false;

      clearSilenceTimer();
      openingSent = false;
      awaitingUser = false;

      if (twilioWs.readyState === WebSocket.OPEN && reconnectAttempts < 2) {
        reconnectAttempts += 1;
        setTimeout(() => connectToOpenAI(), 900);
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

      openingSent = false;
      awaitingUser = false;
      silenceHelpUsed = false;
      pendingUserResponse = false;
      timeWarningPending = false;
      clearSilenceTimer();

      return;
    }

    if (msg.event === "media") {
      // Caller audio comes in constantly, do not treat that as "they answered"
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
