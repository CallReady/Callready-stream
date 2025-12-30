const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;

// Your public wss endpoint that Twilio can reach, for example:
// wss://callready-stream.onrender.com/media
const PUBLIC_WSS_URL = process.env.PUBLIC_WSS_URL || "";

// OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const REALTIME_MODEL = process.env.REALTIME_MODEL || "gpt-4o-realtime-preview";

// Twilio hits this when a call comes in.
// It tells Twilio to connect the call audio to your websocket.
app.post("/voice", (req, res) => {
  if (!PUBLIC_WSS_URL) {
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Server is missing PUBLIC_WSS_URL.</Say>
  <Hangup/>
</Response>`);
    return;
  }

  // Use <Connect><Stream> for bidirectional streaming
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Welcome to CallReady.</Say>
  <Connect>
    <Stream url="${PUBLIC_WSS_URL}">
      <Parameter name="app" value="callready"/>
    </Stream>
  </Connect>
</Response>`;

  res.type("text/xml").send(twiml);
});

// Health check
app.get("/", (req, res) => res.status(200).send("ok"));

const server = http.createServer(app);

// WebSocket server for Twilio Media Streams
const wss = new WebSocket.Server({ server, path: "/media" });

wss.on("connection", (twilioWs) => {
  let openaiWs = null;
  let streamSid = null;

  // Connect to OpenAI Realtime API over WebSocket
  function connectOpenAI() {
    if (!OPENAI_API_KEY) {
      console.log("Missing OPENAI_API_KEY");
      return;
    }

    // OpenAI Realtime WS endpoint
    // Note: OpenAI may require specific query params or headers per docs.
    openaiWs = new WebSocket("wss://api.openai.com/v1/realtime?model=" + encodeURIComponent(REALTIME_MODEL), {
      headers: {
        Authorization: "Bearer " + OPENAI_API_KEY,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    openaiWs.on("open", () => {
      // Start a session with basic instructions.
      // Keep it short and safe. You can expand later.
      const sessionUpdate = {
        type: "session.update",
        session: {
          instructions:
            "You are CallReady, a friendly practice partner helping teens and young adults practice phone calls. " +
            "Keep it appropriate for teens. No sexual content. " +
            "If user expresses self-harm intent, tell them to call or text 988 in the US or local emergency services. " +
            "Do not ask for real personal info. If you need details, say they can make something up for practice.",
          // Ask the model to speak naturally.
          // Voice options vary by model and account.
          // Keep this minimal first.
          turn_detection: { type: "server_vad" }
        }
      };

      openaiWs.send(JSON.stringify(sessionUpdate));

      // Have the AI greet first, like a real call answer.
      const greet = {
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            "Start the practice call by answering as the business. Be friendly and natural. Ask what you can help with."
        }
      };
      openaiWs.send(JSON.stringify(greet));
    });

    openaiWs.on("message", (data) => {
      // OpenAI sends events. We forward audio to Twilio.
      let evt;
      try {
        evt = JSON.parse(data.toString());
      } catch {
        return;
      }

      // Audio deltas arrive as base64 chunks depending on the API event type.
      // Forward them back to Twilio as a Media message.
      // This is the minimal pattern used in Twilio realtime demos.
      if (evt.type === "response.audio.delta" && evt.delta && streamSid) {
        const twilioMsg = {
          event: "media",
          streamSid: streamSid,
          media: { payload: evt.delta } // base64 audio
        };
        twilioWs.send(JSON.stringify(twilioMsg));
      }

      // Optional: log errors for debugging
      if (evt.type && String(evt.type).includes("error")) {
        console.log("OpenAI error event:", evt);
      }
    });

    openaiWs.on("close", () => {
      openaiWs = null;
    });

    openaiWs.on("error", (err) => {
      console.log("OpenAI WS error:", err && err.message ? err.message : err);
      openaiWs = null;
    });
  }

  connectOpenAI();

  twilioWs.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    // Twilio Media Streams events
    if (data.event === "start") {
      streamSid = data.start && data.start.streamSid ? data.start.streamSid : null;
      return;
    }

    if (data.event === "media") {
      // data.media.payload is base64 audio from Twilio.
      // Send to OpenAI as input audio buffer append.
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        const audioAppend = {
          type: "input_audio_buffer.append",
          audio: data.media.payload
        };
        openaiWs.send(JSON.stringify(audioAppend));
      }
      return;
    }

    if (data.event === "stop") {
      try {
        twilioWs.close();
      } catch {}
      return;
    }
  });

  twilioWs.on("close", () => {
    try {
      if (openaiWs) openaiWs.close();
    } catch {}
    openaiWs = null;
  });

  twilioWs.on("error", () => {
    try {
      if (openaiWs) openaiWs.close();
    } catch {}
    openaiWs = null;
  });
});

server.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
