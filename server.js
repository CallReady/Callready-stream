"use strict";

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");
const { Pool } = require("pg");

const app = express();
app.use(express.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PUBLIC_WSS_URL = process.env.PUBLIC_WSS_URL;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

function nowIso() {
  return new Date().toISOString();
}

if (!DATABASE_URL) {
  console.log(nowIso(), "Warning: DATABASE_URL is not set, DB features disabled");
}

const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";

const OPENAI_VOICE = process.env.OPENAI_VOICE || "coral";

const CALLREADY_VERSION =
  "realtime-vadfix-opener-3-ready-ringring-turnlock-2-optin-twilio-single-twiml-end-1-ai-end-skip-transition-1-gibberish-guard-1-end-transition-fix-1-incoming-outgoing-choice-1-meta-textonly-1-overlong-cancel-1";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const TWILIO_SMS_FROM =
  process.env.TWILIO_SMS_FROM ||
  process.env.TWILIO_PHONE_NUMBER ||
  process.env.TWILIO_FROM_NUMBER;

const AI_END_CALL_TRIGGER = "END_CALL_NOW";

const TWILIO_END_TRANSITION =
  "Pardon my interruption, but we've reached the time limit for trial sessions. " +
  "You did something important today by practicing, and that counts, even if it felt awkward or imperfect.";

const TWILIO_OPTIN_PROMPT =
  "You can choose to receive text messages from CallReady. " +
  "If you opt in, we can text you short reminders about what you practiced, what to work on next, and new features as we add them. " +
  "To agree to receive text messages from CallReady, press 1 now. " +
  "If you do not want text messages, press 2 now.";

const GATHER_RETRY_PROMPT =
  "I didn’t get a response from you. Press 1 to receive texts, or press 2 to skip.";

const IN_CALL_CONFIRM_YES =
  "Thanks. You are opted in to receive text messages from CallReady. " +
  "Message and data rates may apply. You can opt out any time by replying STOP. " +
  "Thanks for practicing today. Have a great day and call again soon!";

const IN_CALL_CONFIRM_NO =
  "No problem. You will not receive text messages from CallReady. " +
  "Thanks for practicing with us today. We hope to hear from you again soon. Have a great day and call again soon!";

const OPTIN_CONFIRM_SMS =
  "CallReady: You are opted in to receive texts about your practice sessions. Msg and data rates may apply. Reply STOP to opt out, HELP for help.";

const SMS_TRIAL_TEXT =
  "Hi, this is CallReady.\n\nNice work practicing today. Showing up counts, even if it felt awkward.\n\nWhat went well:\nYou kept going and stayed engaged.\n\nOne thing to work on next:\nPause, then speak a little more slowly.\n\nWant more time, session memory, or summaries? Visit callready.live";

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function hasTwilioRest() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN);
}

function twilioClient() {
  if (!hasTwilioRest()) return null;
  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

async function logCallStartToDb(callSid, fromPhoneE164) {
  if (!pool) return;

  try {
    await pool.query(
      "insert into calls (call_sid, phone_e164, started_at, minutes_cap_applied) values ($1, $2, now(), $3) on conflict (call_sid) do update set phone_e164 = coalesce(calls.phone_e164, excluded.phone_e164)",
      [callSid, fromPhoneE164 || null, 5]
    );

    console.log(nowIso(), "Logged call start to DB", {
      callSid,
      phone_e164: fromPhoneE164 || null,
      minutes_cap_applied: 5,
    });
  } catch (e) {
    console.log(
      nowIso(),
      "DB insert failed for calls start:",
      e && e.message ? e.message : e
    );
  }
}

async function logCallEndToDb(callSid, endedReason) {
  if (!pool) return;
  if (!callSid) return;

  try {
    await pool.query(
      "update calls set ended_at = now(), ended_reason = $2, duration_seconds = extract(epoch from (now() - started_at))::int where call_sid = $1",
      [callSid, endedReason || null]
    );

    console.log(nowIso(), "Logged call end to DB", {
      callSid,
      ended_reason: endedReason || null,
    });
  } catch (e) {
    console.log(
      nowIso(),
      "DB update failed for calls end:",
      e && e.message ? e.message : e
    );
  }
}

function fireAndForgetCallEndLog(callSid, endedReason) {
  try {
    logCallEndToDb(callSid, endedReason).catch((e) => {
      console.log(
        nowIso(),
        "DB update failed for calls end (async):",
        e && e.message ? e.message : e
      );
    });
  } catch {}
}

async function fetchPriorCallContextByCallSid(callSid) {
  if (!pool) return null;
  if (!callSid) return null;

  try {
    const cur = await pool.query(
      "select phone_e164 from calls where call_sid = $1 limit 1",
      [callSid]
    );

    const phone = cur && cur.rows && cur.rows[0] ? cur.rows[0].phone_e164 : null;
    if (!phone) return null;

    const prev = await pool.query(
      "select scenario_tag, last_focus_skill, last_coaching_note, started_at from calls where phone_e164 = $1 and call_sid <> $2 and started_at is not null order by started_at desc limit 1",
      [phone, callSid]
    );

    const row = prev && prev.rows && prev.rows[0] ? prev.rows[0] : null;
    if (!row) return null;

    return {
      scenario_tag: row.scenario_tag || null,
      last_focus_skill: row.last_focus_skill || null,
      last_coaching_note: row.last_coaching_note || null,
    };
  } catch (e) {
    console.log(
      nowIso(),
      "DB fetch failed for prior call context:",
      e && e.message ? e.message : e
    );
    return null;
  }
}

async function setScenarioTagOnce(callSid, tag) {
  if (!pool) return;
  if (!callSid) return;
  if (!tag) return;

  try {
    await pool.query(
      "update calls set scenario_tag = coalesce(scenario_tag, $2) where call_sid = $1",
      [callSid, tag]
    );
    console.log(nowIso(), "Set scenario_tag (once)", { callSid, scenario_tag: tag });
  } catch (e) {
    console.log(
      nowIso(),
      "DB update failed for scenario_tag:",
      e && e.message ? e.message : e
    );
  }
}

async function setFocusAndNote(callSid, focusSkill, coachingNote) {
  if (!pool) return;
  if (!callSid) return;

  const skill = focusSkill ? String(focusSkill) : null;
  const note = coachingNote ? String(coachingNote) : null;

  if (!skill && !note) return;

  try {
    await pool.query(
      "update calls set last_focus_skill = coalesce($2, last_focus_skill), last_coaching_note = coalesce($3, last_coaching_note) where call_sid = $1",
      [callSid, skill, note]
    );

    console.log(nowIso(), "Updated focus/note", {
      callSid,
      last_focus_skill: skill,
      last_coaching_note: note,
    });
  } catch (e) {
    console.log(
      nowIso(),
      "DB update failed for focus/note:",
      e && e.message ? e.message : e
    );
  }
}

function extractTokenLineValue(text, token) {
  if (!text) return null;

  const lines = String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const prefix = token + ":";
  for (const line of lines) {
    if (line.toUpperCase().startsWith(prefix.toUpperCase())) {
      const v = line.substring(prefix.length).trim();
      return v || null;
    }
  }

  const eqPrefix = token + "=";
  for (const line of lines) {
    if (line.toUpperCase().startsWith(eqPrefix.toUpperCase())) {
      const v = line.substring(eqPrefix.length).trim();
      return v || null;
    }
  }

  return null;
}

async function isAlreadyOptedInByPhone(fromPhoneE164) {
  if (!pool) return false;
  if (!fromPhoneE164) return false;

  try {
    const r = await pool.query(
      "select 1 from sms_optins where from_phone = $1 and opted_in = true limit 1",
      [fromPhoneE164]
    );
    return r && r.rowCount > 0;
  } catch (e) {
    console.log(
      nowIso(),
      "DB lookup failed for sms_optins prior opt-in check:",
      e && e.message ? e.message : e
    );
    return false;
  }
}

app.get("/", (req, res) => res.status(200).send("CallReady server up"));
app.get("/health", (req, res) =>
  res.status(200).json({ ok: true, version: CALLREADY_VERSION })
);
app.get("/voice", (req, res) =>
  res.status(200).send("OK. Configure Twilio to POST here.")
);

app.post("/voice", async (req, res) => {
  try {
    const callSid = req.body && req.body.CallSid ? String(req.body.CallSid) : "";
    const from = req.body && req.body.From ? String(req.body.From) : "";

    if (callSid) {
      await logCallStartToDb(callSid, from);
    }

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

// /end supports:
// - retry=1 for the retry prompt
// - skip_transition=1 to go straight to opt-in language (used when AI ends the call)
app.post("/end", async (req, res) => {
  try {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const vr = new VoiceResponse();

    const retry = req.query && req.query.retry ? String(req.query.retry) : "0";
    const isRetry = retry === "1";

    const skipTransition =
      req.query && req.query.skip_transition
        ? String(req.query.skip_transition) === "1"
        : false;

    const from = req.body && req.body.From ? String(req.body.From) : "";
    const callSid = req.body && req.body.CallSid ? String(req.body.CallSid) : "";

    if (!isRetry && !skipTransition) {
      vr.say(TWILIO_END_TRANSITION);
    }

    if (!isRetry) {
      const alreadyOptedIn = await isAlreadyOptedInByPhone(from);
      if (alreadyOptedIn) {
        console.log(nowIso(), "Skipping SMS opt-in prompt, caller already opted in", {
          from,
          callSid,
        });

        if (callSid) {
          fireAndForgetCallEndLog(callSid, "completed_already_opted_in");
        }

        vr.say(
          "Thanks for calling CallReady. We hope you'll call again soon! Have a great day!"
        );
        vr.hangup();
        res.type("text/xml").send(vr.toString());
        return;
      }
    }

    const gather = vr.gather({
      numDigits: 1,
      timeout: 7,
      action: "/gather-result",
      method: "POST",
    });

    if (isRetry) {
      gather.say(GATHER_RETRY_PROMPT);
    } else {
      gather.say(TWILIO_OPTIN_PROMPT);
    }

    if (!isRetry) {
      const retryUrl = skipTransition
        ? "/end?retry=1&skip_transition=1"
        : "/end?retry=1";
      vr.redirect({ method: "POST" }, retryUrl);
    } else {
      vr.say(IN_CALL_CONFIRM_NO);
      vr.hangup();
    }

    res.type("text/xml").send(vr.toString());
  } catch (err) {
    console.error("Error building /end TwiML:", err);
    res.status(500).send("Error");
  }
});

app.post("/gather-result", async (req, res) => {
  try {
    const digits = req.body && req.body.Digits ? String(req.body.Digits) : "";
    const from = req.body && req.body.From ? String(req.body.From) : "";
    const callSid = req.body && req.body.CallSid ? String(req.body.CallSid) : "";

    const VoiceResponse = twilio.twiml.VoiceResponse;
    const vr = new VoiceResponse();

    const pressed1 = digits === "1";

    try {
      if (pool) {
        await pool.query(
          "insert into sms_optins (call_sid, from_phone, digits, opted_in, consent_version, source) values ($1, $2, $3, $4, $5, $6)",
          [callSid, from, digits, pressed1, "sms_optin_v1", "DTMF during call"]
        );
        console.log(nowIso(), "Saved SMS opt-in to DB", {
          callSid,
          from,
          digits,
          optedIn: pressed1,
        });
      } else {
        console.log(nowIso(), "DB not configured, skipping sms_optins insert");
      }
    } catch (e) {
      console.log(
        nowIso(),
        "DB insert failed for sms_optins:",
        e && e.message ? e.message : e
      );
    }

    try {
      if (pool && callSid) {
        await pool.query(
          "update calls set opted_in_sms_during_call = $2 where call_sid = $1",
          [callSid, pressed1]
        );
        console.log(nowIso(), "Updated calls.opted_in_sms_during_call", {
          callSid,
          opted_in_sms_during_call: pressed1,
        });
      }
    } catch (e) {
      console.log(
        nowIso(),
        "DB update failed for calls.opted_in_sms_during_call:",
        e && e.message ? e.message : e
      );
    }

    if (callSid) {
      await logCallEndToDb(
        callSid,
        pressed1 ? "completed_opted_in" : "completed_declined"
      );
    }

    if (pressed1) {
      vr.say(IN_CALL_CONFIRM_YES);

      const client = twilioClient();
      if (!client) {
        console.log(
          nowIso(),
          "Cannot send SMS, missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN"
        );
      } else if (!TWILIO_SMS_FROM) {
        console.log(
          nowIso(),
          "Cannot send SMS, missing TWILIO_SMS_FROM (or TWILIO_PHONE_NUMBER)"
        );
      } else if (!from) {
        console.log(nowIso(), "Cannot send SMS, missing caller From number");
      } else {
        try {
          await client.messages.create({
            to: from,
            from: TWILIO_SMS_FROM,
            body: OPTIN_CONFIRM_SMS,
          });
          console.log(nowIso(), "Opt-in confirmation SMS sent to", from);

          // Optional
          // await client.messages.create({ to: from, from: TWILIO_SMS_FROM, body: SMS_TRIAL_TEXT });
        } catch (e) {
          console.log(
            nowIso(),
            "SMS send error:",
            e && e.message ? e.message : e
          );
        }
      }

      vr.hangup();
    } else {
      vr.say(IN_CALL_CONFIRM_NO);
      vr.hangup();
    }

    res.type("text/xml").send(vr.toString());
  } catch (err) {
    console.error("Error building /gather-result TwiML:", err);
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
  let responseActive = false;

  let openerAudioDeltaCount = 0;
  let openerResent = false;
  let openerRetryTimer = null;

  let turnDetectionEnabled = false;

  let waitingForFirstCallerSpeech = true;
  let sawSpeechStarted = false;

  let requireCallerSpeechBeforeNextAI = false;
  let sawCallerSpeechSinceLastAIDone = false;

  let sessionTimerStarted = false;
  let sessionTimer = null;

  let endRedirectRequested = false;

  let suppressCallerAudioToOpenAI = false;

  let lastCancelAtMs = 0;

  let priorContext = null;

  let scenarioTagAlreadyCaptured = false;

  let lastUserTranscript = "";
  let lastUserTranscriptAtMs = 0;
  let lastAssistantUserFacingText = "";
  let clarificationRequestedAtMs = 0;
  let clarificationInFlight = false;

  // Text-only meta requests (prevents meta being spoken)
  let metaScenarioRequested = false;
  let metaFeedbackRequested = false;
  let metaResponseInFlight = false;

  // Overlong response guard
  let responseAudioStartedAtMs = 0;
  let overlongTimer = null;

  console.log(nowIso(), "Twilio WS connected", "version:", CALLREADY_VERSION);

  function closeAll(reason) {
    if (closing) return;
    closing = true;
    console.log(nowIso(), "Closing:", reason);

    try {
      if (sessionTimer) clearTimeout(sessionTimer);
    } catch {}

    try {
      if (openerRetryTimer) clearTimeout(openerRetryTimer);
    } catch {}

    try {
      if (overlongTimer) clearTimeout(overlongTimer);
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

  function cancelOpenAIResponseIfAnyOnce(reason) {
    const now = Date.now();
    if (now - lastCancelAtMs < 500) return;
    lastCancelAtMs = now;
    try {
      console.log(nowIso(), "Cancelling response due to:", reason);
      openaiSend({ type: "response.cancel" });
    } catch {}
  }

  function cleanUserFacingText(text) {
    if (!text) return "";
    const lines = String(text)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const kept = [];
    for (const line of lines) {
      const upper = line.toUpperCase();

      if (upper.startsWith("SCENARIO_TAG:")) continue;
      if (upper.startsWith("FOCUS_SKILL:")) continue;
      if (upper.startsWith("COACHING_NOTE:")) continue;

      if (upper.startsWith("META_SCENARIO=")) continue;
      if (upper.startsWith("META_FOCUS=")) continue;
      if (upper.startsWith("META_NOTE=")) continue;
      if (upper.startsWith("META_")) continue;

      if (upper === AI_END_CALL_TRIGGER) continue;
      if (upper === "END CALL NOW") continue;

      kept.push(line);
    }
    return kept.join(" ").replace(/\s+/g, " ").trim();
  }

  function isLikelyUnintelligibleTranscript(text) {
    const t = (text || "").trim();
    if (!t) return true;
    if (t.length <= 2) return true;

    const letters = (t.match(/[A-Za-z]/g) || []).length;
    const digits = (t.match(/[0-9]/g) || []).length;
    const spaces = (t.match(/\s/g) || []).length;
    const nonWord = (t.match(/[^A-Za-z0-9\s']/g) || []).length;

    const denom = t.length || 1;
    const letterRatio = letters / denom;
    const nonWordRatio = nonWord / denom;

    if (nonWordRatio > 0.25) return true;
    if (letterRatio < 0.35 && digits < 2) return true;

    const words = t
      .split(/\s+/)
      .map((w) => w.trim())
      .filter(Boolean);

    if (words.length === 0) return true;

    const hasVowels = /[aeiouy]/i.test(t);
    if (!hasVowels && letters >= 6) return true;

    if (/(.)\1{5,}/.test(t)) return true;

    const lower = t.toLowerCase();
    const commonShort = new Set([
      "yes",
      "yeah",
      "yep",
      "no",
      "nope",
      "ok",
      "okay",
      "sure",
      "help",
      "repeat",
      "again",
    ]);

    if (words.length === 1 && t.length <= 4 && !commonShort.has(lower)) return true;
    if (spaces / denom > 0.5) return true;

    return false;
  }

  function requestClarification(reason, transcript) {
    if (!turnDetectionEnabled) return;
    if (endRedirectRequested) return;
    if (!openaiReady) return;

    const now = Date.now();
    if (clarificationInFlight && now - clarificationRequestedAtMs < 3000) return;

    clarificationInFlight = true;
    clarificationRequestedAtMs = now;

    console.log(nowIso(), "Unintelligible input detected, asking to repeat", {
      reason,
      transcript: transcript ? String(transcript).slice(0, 120) : "",
    });

    cancelOpenAIResponseIfAnyOnce("unintelligible_input");

    try {
      openaiSend({ type: "input_audio_buffer.clear" });
    } catch {}

    setTimeout(() => {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) return;

      const lastPrompt = lastAssistantUserFacingText
        ? `Your last question was: "${lastAssistantUserFacingText}"`
        : "Ask them to answer the last question again.";

      openaiSend({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions:
            "You are CallReady.\n" +
            "The caller's last response was unclear or unintelligible.\n" +
            "Do not guess what they meant.\n" +
            "In one or two short sentences, kindly ask them to repeat more clearly.\n" +
            "Then say one short reminder: they can take their time and speak a little slower.\n" +
            "Then ask them to answer your last question again.\n" +
            lastPrompt +
            "\n" +
            "Important: Do not output any META lines in this response.\n" +
            "Ask only one question at the end, then stop speaking and wait.",
        },
      });
    }, 200);
  }

  function sendOpenerOnce(label) {
    console.log(nowIso(), "Sending opener", label ? `(${label})` : "");
    openaiSend({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions:
          "Speak this exactly, naturally, then stop speaking:\n" +
          "Welcome to CallReady, a safe place to practice phone calls before they matter. " +
          "I'm an AI helper, so you can practice without pressure. " +
          "If you get stuck, you can say help me, and I'll give you a simple line to try. " +
          "Before we start, try to be somewhere quiet, because background noise can make it harder to hear you. " +
          "Quick question first. Do you want to practice answering an incoming call, or making an outgoing call?",
      },
    });
  }

  function armOpenerRetryTimer() {
    if (openerRetryTimer) return;

    openerRetryTimer = setTimeout(() => {
      if (turnDetectionEnabled) return;
      if (!openerSent) return;
      if (openerAudioDeltaCount > 0) return;
      if (openerResent) return;

      if (responseActive) {
        console.log(nowIso(), "Opener retry waiting, OpenAI response still active");
        try {
          openerRetryTimer = null;
        } catch {}
        armOpenerRetryTimer();
        return;
      }

      openerResent = true;
      console.log(nowIso(), "Opener audio did not arrive, resending opener once");
      sendOpenerOnce("retry");
    }, 1500);
  }

  function prepForEnding() {
    suppressCallerAudioToOpenAI = true;

    waitingForFirstCallerSpeech = false;
    sawSpeechStarted = true;
    requireCallerSpeechBeforeNextAI = false;
    sawCallerSpeechSinceLastAIDone = true;

    openaiSend({ type: "input_audio_buffer.clear" });
    openaiSend({
      type: "session.update",
      session: {
        turn_detection: null,
      },
    });
  }

  async function redirectCallToEnd(reason, opts) {
    if (endRedirectRequested) return;
    endRedirectRequested = true;

    const skipTransition = opts && opts.skipTransition ? true : false;

    if (!callSid) {
      console.log(nowIso(), "Cannot redirect to /end, missing callSid", reason);
      closeAll("Missing callSid for end redirect");
      return;
    }

    if (!hasTwilioRest()) {
      console.log(
        nowIso(),
        "Cannot redirect to /end, missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN",
        reason
      );
      closeAll("Missing Twilio REST creds for end redirect");
      return;
    }

    if (!PUBLIC_BASE_URL) {
      console.log(nowIso(), "Cannot redirect to /end, missing PUBLIC_BASE_URL", reason);
      closeAll("Missing PUBLIC_BASE_URL for end redirect");
      return;
    }

    try {
      const client = twilioClient();
      const base = PUBLIC_BASE_URL.replace(/\/+$/, "");
      const endUrl = skipTransition
        ? `${base}/end?retry=0&skip_transition=1`
        : `${base}/end?retry=0`;

      console.log(
        nowIso(),
        "Redirecting call to /end now",
        callSid,
        "reason:",
        reason,
        "skipTransition:",
        skipTransition
      );

      await client.calls(callSid).update({
        url: endUrl,
        method: "POST",
      });

      console.log(nowIso(), "Redirected call to /end via Twilio REST", callSid);

      closeAll("Redirected to /end");
    } catch (err) {
      console.log(
        nowIso(),
        "Twilio REST redirect to /end error:",
        err && err.message ? err.message : err
      );
      closeAll("Redirect to /end failed");
    }
  }

  function maybeStartSessionTimer() {
    if (sessionTimerStarted) return;
    sessionTimerStarted = true;

    sessionTimer = setTimeout(() => {
      console.log(nowIso(), "Trial timer fired, ending session, redirecting to /end");
      cancelOpenAIResponseIfAnyOnce("redirecting to /end");
      prepForEnding();
      redirectCallToEnd("Trial timer fired", { skipTransition: false });
    }, 300 * 1000);

    console.log(nowIso(), "Session timer started (300s) after first caller speech_started");
  }

  function extractTextFromResponseDone(msg) {
    let out = "";

    const response = msg && msg.response ? msg.response : null;
    if (!response) return out;

    const output = Array.isArray(response.output) ? response.output : [];
    for (const item of output) {
      if (!item) continue;
      const content = Array.isArray(item.content) ? item.content : [];
      for (const c of content) {
        if (!c) continue;
        if (typeof c.text === "string") out += c.text + "\n";
        if (typeof c.value === "string") out += c.value + "\n";
        if (typeof c.transcript === "string") out += c.transcript + "\n";
      }
      if (typeof item.text === "string") out += item.text + "\n";
      if (typeof item.transcript === "string") out += item.transcript + "\n";
    }

    if (typeof response.output_text === "string") out += response.output_text + "\n";

    return out;
  }

  function responseTextRequestsEnd(text) {
    if (!text) return false;
    const t = String(text).toUpperCase();
    if (t.includes(AI_END_CALL_TRIGGER)) return true;
    if (t.includes("END CALL NOW")) return true;
    return false;
  }

  function responseTextLooksLikeEndOkay(text) {
    if (!text) return false;

    const lines = String(text)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return false;

    const joined = lines.join(" ").replace(/\s+/g, " ").trim();
    const upper = joined.toUpperCase();

    const normalized = upper.replace(/[^A-Z]/g, "");
    if (normalized !== "OKAY") return false;

    if (joined.length > 12) return false;

    return true;
  }

  function buildReturnCallerInstructions(ctx) {
    if (!ctx) return "";

    const parts = [];
    if (ctx.scenario_tag) parts.push(`Last time they practiced: ${ctx.scenario_tag}.`);
    if (ctx.last_focus_skill) parts.push(`They were working on: ${ctx.last_focus_skill}.`);
    if (ctx.last_coaching_note) parts.push(`Reminder: ${ctx.last_coaching_note}.`);

    if (parts.length === 0) return "";

    return (
      "\nReturn caller context:\n" +
      parts.join(" ") +
      "\nIf this is a return caller, briefly welcome them back in one sentence, then ask exactly one question:\n" +
      "\"Do you want to practice that again, or try something new?\"\n"
    );
  }

  function requestMetaScenarioTextOnly() {
    if (metaScenarioRequested) return;
    if (scenarioTagAlreadyCaptured) return;
    if (!openaiReady) return;

    metaScenarioRequested = true;
    metaResponseInFlight = true;

    console.log(nowIso(), "Requesting META_SCENARIO via text-only response");

    openaiSend({
      type: "response.create",
      response: {
        modalities: ["text"],
        instructions:
          "Output exactly one line and nothing else:\n" +
          "META_SCENARIO=<scenario>_<incoming_or_outgoing>\n" +
          "Example:\n" +
          "META_SCENARIO=retail_return_incoming\n" +
          "Do not include any other words.",
      },
    });
  }

  function requestMetaFeedbackTextOnly() {
    if (metaFeedbackRequested) return;
    if (!openaiReady) return;

    metaFeedbackRequested = true;
    metaResponseInFlight = true;

    console.log(nowIso(), "Requesting META_FOCUS and META_NOTE via text-only response");

    openaiSend({
      type: "response.create",
      response: {
        modalities: ["text"],
        instructions:
          "Output exactly two lines and nothing else:\n" +
          "META_FOCUS=<short_snake_case_skill>\n" +
          "META_NOTE=<one short sentence>\n" +
          "Do not include any other words.",
      },
    });
  }

  function startOpenAIRealtime() {
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      closeAll("Missing OPENAI_API_KEY");
      return;
    }

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(
      OPENAI_REALTIME_MODEL
    )}`;

    openaiWs = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openaiWs.on("open", () => {
      openaiReady = true;
      console.log(nowIso(), "OpenAI WS open");

      const returnCallerBlock = buildReturnCallerInstructions(priorContext);

      openaiSend({
        type: "session.update",
        session: {
          voice: OPENAI_VOICE,
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: null,
          temperature: 0.6,
          modalities: ["audio", "text"],

          input_audio_transcription: {
            model: "whisper-1",
          },

          instructions:
            "You are CallReady. You help teens and young adults practice real phone calls.\n" +
            "Speak like a friendly, calm person on a real phone call.\n" +
            "\n" +
            "Style rules:\n" +
            "Use short sentences.\n" +
            "Use contractions.\n" +
            "Keep your turn brief.\n" +
            "After you ask a question, stop speaking.\n" +
            "Do not keep talking to yourself.\n" +
            "\n" +
            "Unclear input rule:\n" +
            "If the caller's answer is unclear or does not make sense, do not guess.\n" +
            "Ask them to repeat, then ask your last question again.\n" +
            "\n" +
            "Safety:\n" +
            "Never sexual content.\n" +
            "Never request real personal information. If needed, tell the caller they can make something up.\n" +
            "If self-harm intent appears, stop roleplay and recommend help (US: 988, immediate danger: 911).\n" +
            "\n" +
            "Direction rule:\n" +
            "The opener already asked whether this is incoming or outgoing.\n" +
            "Do not ask that again unless the caller did not answer it.\n" +
            "\n" +
            "Scenario choice:\n" +
            "After you know incoming or outgoing, ask exactly one question:\n" +
            "\"Do you want to tell me what kind of call you want to practice, or should I pick an easy one?\"\n" +
            "Wait.\n" +
            "\n" +
            "Do not speak any tags or metadata.\n" +
            "Never say anything that starts with META_.\n" +
            "\n" +
            "Ending rule:\n" +
            "If the caller asks to end the call, quit, stop, hang up, or says they do not want to do this anymore, you MUST do BOTH in the SAME response:\n" +
            "1) Say one word: Okay.\n" +
            "2) In TEXT ONLY, output this exact token on its own line: END_CALL_NOW\n" +
            "Never say the token out loud.\n" +
            "Do not ask follow up questions.\n" +
            "\n" +
            "Roleplay start rules:\n" +
            "Once the scenario is chosen and setup is clear, ask: \"Are you ready to start?\" Wait for yes.\n" +
            "\n" +
            "Ring rule:\n" +
            "For OUTGOING practice, ring and the other person's first line must be in the same spoken turn.\n" +
            "Say \"Ring, ring!\" then immediately answer as the other person.\n" +
            "For INCOMING practice, say \"Ring, ring!\" then stop and wait for the caller to answer first.\n" +
            "If they forget, prompt once: \"Go ahead and answer the phone.\" Then wait.\n" +
            "\n" +
            "Scenario completion rule:\n" +
            "When the scenario is complete, say: \"Okay, that wraps the scenario.\" Then ask exactly one question:\n" +
            "\"Would you like some feedback on how you did, run scenario again, or try something different?\"\n" +
            "Then stop speaking and wait.\n" +
            "\n" +
            "If they ask for feedback:\n" +
            "Keep it 30 to 45 seconds.\n" +
            "Give two strengths, two improvements, and one model line.\n" +
            "Then ask exactly one question:\n" +
            "\"Do you want to try that scenario again, try a different scenario, or end the call?\"\n" +
            "Then stop speaking and wait.\n" +
            returnCallerBlock,
        },
      });

      if (!openerSent) {
        openerSent = true;
        openerAudioDeltaCount = 0;
        openerResent = false;

        sendOpenerOnce("initial");
        armOpenerRetryTimer();
      }
    });

    openaiWs.on("message", (data) => {
      const msg = safeJsonParse(data.toString());
      if (!msg) return;

      if (msg.type === "conversation.item.input_audio_transcription.completed") {
        const transcript = typeof msg.transcript === "string" ? msg.transcript : "";
        lastUserTranscript = transcript;
        lastUserTranscriptAtMs = Date.now();

        if (turnDetectionEnabled) {
          const bad = isLikelyUnintelligibleTranscript(transcript);
          if (bad) requestClarification("transcription_completed_unintelligible", transcript);
        }
        return;
      }

      if (msg.type === "conversation.item.input_audio_transcription.failed") {
        const err = msg.error || {};
        const code = err.code || "transcription_failed";
        lastUserTranscript = "";
        lastUserTranscriptAtMs = Date.now();

        if (turnDetectionEnabled) {
          requestClarification(`transcription_failed_${code}`, "");
        }
        return;
      }

      if (msg.type === "response.audio.delta" && msg.delta && streamSid) {
        if (!turnDetectionEnabled && openerSent) {
          openerAudioDeltaCount += 1;
          if (openerAudioDeltaCount === 1) {
            console.log(nowIso(), "Opener: first audio delta forwarded to Twilio");
          }
        }

        if (!turnDetectionEnabled) {
          // allow opener audio
        } else {
          if (waitingForFirstCallerSpeech && !sawSpeechStarted) {
            cancelOpenAIResponseIfAnyOnce("AI spoke before first caller speech");
            return;
          }

          if (requireCallerSpeechBeforeNextAI && !sawCallerSpeechSinceLastAIDone) {
            cancelOpenAIResponseIfAnyOnce("turn lock active");
            return;
          }
        }

        if (!responseAudioStartedAtMs) {
          responseAudioStartedAtMs = Date.now();

          try {
            if (overlongTimer) clearTimeout(overlongTimer);
          } catch {}
          overlongTimer = setTimeout(() => {
            if (!turnDetectionEnabled) return;
            if (!responseActive) return;
            cancelOpenAIResponseIfAnyOnce("response too long");
          }, 18000);
        }

        twilioSend({
          event: "media",
          streamSid,
          media: { payload: msg.delta },
        });
        return;
      }

      if (msg.type === "input_audio_buffer.speech_started") {
        sawSpeechStarted = true;

        if (waitingForFirstCallerSpeech) {
          waitingForFirstCallerSpeech = false;
          console.log(nowIso(), "Caller speech detected, AI may respond now");
        }

        if (turnDetectionEnabled) {
          maybeStartSessionTimer();
        }

        sawCallerSpeechSinceLastAIDone = true;
        return;
      }

      if (msg.type === "response.created") {
        responseActive = true;
        responseAudioStartedAtMs = 0;

        if (turnDetectionEnabled) {
          const ageMs = Date.now() - lastUserTranscriptAtMs;
          if (ageMs >= 0 && ageMs < 2000) {
            const bad = isLikelyUnintelligibleTranscript(lastUserTranscript);
            if (bad) {
              requestClarification("response_created_after_bad_transcript", lastUserTranscript);
              return;
            }
          }

          if (waitingForFirstCallerSpeech && !sawSpeechStarted) {
            cancelOpenAIResponseIfAnyOnce("response.created before caller speech");
            return;
          }

          if (requireCallerSpeechBeforeNextAI && !sawCallerSpeechSinceLastAIDone) {
            cancelOpenAIResponseIfAnyOnce("turn lock active");
            return;
          }
        }

        return;
      }

      if (msg.type === "response.done") {
        const text = extractTextFromResponseDone(msg);
        responseActive = false;

        try {
          if (overlongTimer) clearTimeout(overlongTimer);
        } catch {}
        overlongTimer = null;
        responseAudioStartedAtMs = 0;

        // If this was a text-only meta response, only parse tokens, do not touch turn flow.
        if (metaResponseInFlight) {
          metaResponseInFlight = false;

          if (text && callSid) {
            const scenarioTag = extractTokenLineValue(text, "META_SCENARIO");
            if (scenarioTag && !scenarioTagAlreadyCaptured) {
              scenarioTagAlreadyCaptured = true;
              setScenarioTagOnce(callSid, scenarioTag);
            }

            const focusSkill = extractTokenLineValue(text, "META_FOCUS");
            const coachingNote = extractTokenLineValue(text, "META_NOTE");
            if (focusSkill || coachingNote) {
              setFocusAndNote(callSid, focusSkill, coachingNote);
            }
          }
          return;
        }

        const cleaned = cleanUserFacingText(text);
        if (cleaned) lastAssistantUserFacingText = cleaned;

        if (clarificationInFlight) {
          const age = Date.now() - clarificationRequestedAtMs;
          if (age < 15000) {
            clarificationInFlight = false;
          }
        }

        if (openerSent && !turnDetectionEnabled) {
          turnDetectionEnabled = true;
          waitingForFirstCallerSpeech = true;
          sawSpeechStarted = false;

          requireCallerSpeechBeforeNextAI = false;
          sawCallerSpeechSinceLastAIDone = false;

          console.log(nowIso(), "Opener done, enabling VAD and clearing buffer");

          try {
            if (openerRetryTimer) clearTimeout(openerRetryTimer);
          } catch {}
          openerRetryTimer = null;

          openaiSend({ type: "input_audio_buffer.clear" });

          openaiSend({
            type: "session.update",
            session: {
              turn_detection: {
                type: "server_vad",
                silence_duration_ms: 900,
                prefix_padding_ms: 300,
                threshold: 0.5,
              },
            },
          });

          return;
        }

        // If the assistant just asked "Are you ready to start?", request scenario meta via text-only.
        if (
          turnDetectionEnabled &&
          cleaned &&
          cleaned.toLowerCase().includes("are you ready to start") &&
          !scenarioTagAlreadyCaptured &&
          !metaScenarioRequested
        ) {
          requestMetaScenarioTextOnly();
        }

        // If the assistant just finished feedback (it always ends with this exact question), request feedback meta via text-only.
        if (
          turnDetectionEnabled &&
          cleaned &&
          cleaned.includes(
            "Do you want to try that scenario again, try a different scenario, or end the call?"
          ) &&
          !metaFeedbackRequested
        ) {
          requestMetaFeedbackTextOnly();
        }

        if (turnDetectionEnabled) {
          const aiRequestedEnd =
            responseTextRequestsEnd(text) || responseTextLooksLikeEndOkay(text);

          if (!endRedirectRequested && aiRequestedEnd) {
            console.log(nowIso(), "Detected AI end intent, redirecting to /end (skip transition)");
            cancelOpenAIResponseIfAnyOnce("AI requested end");
            prepForEnding();
            redirectCallToEnd("AI requested end", { skipTransition: true });
            return;
          }

          requireCallerSpeechBeforeNextAI = true;
          sawCallerSpeechSinceLastAIDone = false;
          return;
        }
      }

      if (msg.type === "error") {
        const errObj = msg.error || msg;

        const code =
          (errObj && errObj.code) ||
          (errObj && errObj.error && errObj.error.code) ||
          null;

        if (code === "response_cancel_not_active") {
          console.log(nowIso(), "Ignoring non-fatal OpenAI error:", code);
          return;
        }

        if (code === "input_audio_buffer_commit_empty") {
          console.log(nowIso(), "Ignoring non-fatal OpenAI error:", code);
          return;
        }

        if (code === "conversation_already_has_active_response") {
          console.log(nowIso(), "Ignoring non-fatal OpenAI error:", code);
          return;
        }

        console.log(nowIso(), "OpenAI error event:", errObj);
        closeAll("OpenAI error");
        return;
      }
    });

    openaiWs.on("close", () => {
      console.log(nowIso(), "OpenAI WS closed");
      openaiReady = false;
      closeAll("OpenAI closed");
    });

    openaiWs.on("error", (err) => {
      console.log(nowIso(), "OpenAI WS error:", err && err.message ? err.message : err);
      openaiReady = false;
      closeAll("OpenAI WS error");
    });
  }

  twilioWs.on("message", async (data) => {
    const msg = safeJsonParse(data.toString());
    if (!msg) return;

    if (msg.event === "start") {
      streamSid = msg.start && msg.start.streamSid ? msg.start.streamSid : null;
      callSid = msg.start && msg.start.callSid ? msg.start.callSid : null;

      console.log(nowIso(), "Twilio stream start:", streamSid || "(no streamSid)");
      console.log(nowIso(), "Twilio callSid:", callSid || "(no callSid)");

      if (callSid) {
        priorContext = await fetchPriorCallContextByCallSid(callSid);
        if (priorContext) {
          console.log(nowIso(), "Loaded prior call context", priorContext);
        }
      }

      startOpenAIRealtime();
      return;
    }

    if (msg.event === "media") {
      if (!turnDetectionEnabled) return;
      if (suppressCallerAudioToOpenAI) return;

      if (openaiReady && msg.media && msg.media.payload) {
        if (requireCallerSpeechBeforeNextAI && !sawCallerSpeechSinceLastAIDone) {
          sawCallerSpeechSinceLastAIDone = true;
        }

        openaiSend({
          type: "input_audio_buffer.append",
          audio: msg.media.payload,
        });
      }
      return;
    }

    if (msg.event === "stop") {
      console.log(nowIso(), "Twilio stream stop");

      if (callSid) {
        const endedReason = endRedirectRequested
          ? "redirected_to_end"
          : "hangup_or_stream_stop";
        fireAndForgetCallEndLog(callSid, endedReason);
      }

      closeAll("Twilio stop");
      return;
    }
  });

  twilioWs.on("close", () => {
    console.log(nowIso(), "Twilio WS closed");
    closeAll("Twilio WS closed");
  });

  twilioWs.on("error", (err) => {
    console.log(nowIso(), "Twilio WS error:", err && err.message ? err.message : err);
    closeAll("Twilio WS error");
  });
});

server.listen(PORT, () => {
  console.log(nowIso(), `Server listening on ${PORT}`, "version:", CALLREADY_VERSION);
  console.log(nowIso(), "POST /voice, WS /media");
});