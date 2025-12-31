"use strict";

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PUBLIC_WSS_URL = process.env.PUBLIC_WSS_URL;

const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";
const OPENAI_VOICE = process.env.OPENAI_VOICE || "alloy";

const CALLREADY_VERSION =
  "realtime-vadfix-opener-3-ready-ringring-turnlock-2-wrap-options-timerclose-1";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const CLOSING_SCRIPT =
  "It looks like our time for this session is about up. If you'd like more time, the ability to remember precious sessions, or recieve a text summary of our session and what to work on next, please visit callready.live. Thanks for using CallReady and I look forward to our next session. Goodbye!";

const GOODBYE_TRIGGER =
  "Thanks for using CallReady and I look forward to our next session. Goodbye!";

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

app.get("/", (req, res) => res.status(200).send("CallReady server up"));
app.get("/health", (req, res) =>
  res.status(200).json({ ok: true, version: CALLREADY_VERSION })
);
app.get("/voice", (req, res) =>
  res.status(200).send("OK. Configure Twilio to POST here.")
);

app.post("/voice", (req, res) => {
  try {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const vr = new VoiceResponse();

    if (!PUBLIC_WSS_URL) {
      vr.say("Server is missing PUBLIC W S S U R L.");
      vr.hangup();
      res.type("text/xml").send(vr.toString());
      return;
    }

    const connect = vr.connect();
    connect.stream({ url: PUBLIC_WSS_URL });

    res.type("text/xml").send(vr.toString());
  } catch (err) {
    console.error("Error building TwiML:", err);
    res.status(500).send("Error");
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media" });

wss.on("connection", (twilioWs) => {
  let streamSid = null;
  let callSid = null;

  let openaiWs = null;
  let openaiReady = false;
  let closing = false;

  let openerSent = false;

  // We keep turn detection off during the opener, then enable it.
  let turnDetectionEnabled = false;

  // After enabling VAD, we do NOT allow the AI to speak until we detect actual caller speech.
  let waitingForFirstCallerSpeech = true;
  let sawSpeechStarted = false;

  // Turn lock:
  // After any AI response is done, require caller speech before allowing another AI response.
  let requireCallerSpeechBeforeNextAI = false;
  let sawCallerSpeechSinceLastAIDone = false;

  // Closing control
  let sessionTimerStarted = false;
  let sessionTimer = null;

  let closingInProgress = false;
  let closingRequested = false;
  let hangupAfterCurrentResponse = false;

  let aiTextBuffer = "";

  console.log(nowIso(), "Twilio WS connected", "version:", CALLREADY_VERSION);

  function closeAll(reason) {
    if (closing) return;
    closing = true;
    console.log(nowIso(), "Closing:", reason);

    try {
      if (sessionTimer) clearTimeout(sessionTimer);
    } catch {}

    try {
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    } catch {}
    try {
      if (twilioWs && twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    } catch {}
  }

  function twilioSend(obj) {
    if (twilioWs.readyState !== WebSocket.OPEN) return;
    twilioWs.send(JSON.stringify(obj));
  }

  function openaiSend(obj) {
    if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) return;
    openaiWs.send(JSON.stringify(obj));
  }

  function cancelOpenAIResponseIfAny() {
    try {
      openaiSend({ type: "response.cancel" });
    } catch {}
  }

  async function endCallViaTwilioRest(reason) {
    if (!callSid) {
      console.log(nowIso(), "Cannot end call via REST, missing callSid", reason);
      return false;
    }
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      console.log(
        nowIso(),
        "Cannot
