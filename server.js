//Best version yet! Definite quality fallback
"use strict";

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const twilio = require("twilio");
const { Pool } = require("pg");
const Stripe = require("stripe");

const app = express();
const path = require("path");
// Serve audio-fixed folder publicly (for ring sounds and other static audio)
app.use("/audio-fixed", express.static(path.join(process.cwd(), "audio-fixed")));
// Serve static files (so Twilio can fetch the ring MP3)
app.use(express.static(__dirname));
app.set("strict routing", true);
app.get("/media", (req, res) => {
  res.status(426).send("This endpoint is WebSocket-only. Twilio connects via wss://.../media");
});

const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PUBLIC_WSS_URL = process.env.PUBLIC_WSS_URL;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
console.log(nowIso(), "Stripe configured at boot:", !!STRIPE_SECRET_KEY);
const STRIPE_PRICE_MEMBER = process.env.STRIPE_PRICE_MEMBER;
const STRIPE_PRICE_POWER = process.env.STRIPE_PRICE_POWER;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const REENGAGE_CRON_SECRET = process.env.REENGAGE_CRON_SECRET;
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  (req, res) => {
    if (!stripe) return res.status(500).send("Stripe not configured");

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send("Webhook Error: " + err.message);
    }

    // Handle events you care about
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // TODO: fulfill membership based on session
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        // TODO: update your database subscription status
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  }
);

// Put this AFTER the Stripe webhook route so Twilio form posts still work
app.use(express.urlencoded({ extended: false }));


const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

function nowIso() {
  return new Date().toISOString();
}
process.on("uncaughtException", (err) => {
  console.log(nowIso(), "FATAL uncaughtException:", err && err.stack ? err.stack : err);
});

process.on("unhandledRejection", (err) => {
  console.log(nowIso(), "FATAL unhandledRejection:", err && err.stack ? err.stack : err);
});

if (!DATABASE_URL) {
  console.log(nowIso(), "Warning: DATABASE_URL is not set, DB features disabled");
}
process.on("SIGTERM", () => {
  console.log(nowIso(), "FATAL received SIGTERM, process is being terminated");
});

process.on("SIGINT", () => {
  console.log(nowIso(), "FATAL received SIGINT, process is being interrupted");
});

process.on("exit", (code) => {
  console.log(nowIso(), "FATAL process exit", { code });
});

const OPENAI_REALTIME_MODEL =
  process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-mini";

const OPENAI_VOICE = process.env.OPENAI_VOICE || "marin";

const CALLREADY_VERSION =
  "realtime-vadfix-opener-3-ready-ringring-turnlock-2-optin-twilio-single-twiml-end-1-ai-end-skip-transition-1-gibberish-guard-1-end-transition-fix-1-mode-reset-1-endphrase-1-cancel-ignore-1-callers-table-sms-state-1-end-transition-for-opted-in-1-openaisend-fix-1-tier-enforcement-1-cycle-bucket-1-fixed-opener-1";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const TWILIO_SMS_FROM =
  process.env.TWILIO_SMS_FROM ||
  process.env.TWILIO_PHONE_NUMBER ||
  process.env.TWILIO_FROM_NUMBER;

const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

const AI_END_CALL_TRIGGER = "END_CALL_NOW";

const TWILIO_END_TRANSITION =
  "Thanks for practicing with CallReady. " +
  "If you want more practice sessions each month, you can explore memberships at CallReady dot live. " +
  "You did something important today by practicing, and that counts, even if it felt awkward or imperfect.";

const TWILIO_HARD_LIMIT_MESSAGE =
  "Pardon the interruption, but we have reached the maximum time for this practice session, so we need to end the call now. " +
  "You can call back anytime to keep practicing.";


const TWILIO_OPTIN_PROMPT =
  "You can choose to receive text messages from CallReady. " +
  "If you opt in, we can text you short reminders about what you practiced, what to work on next, and new features as we add them. " +
  "To agree to receive text messages from CallReady, press 1 now. " +
  "If you do not want text messages, press 2 now.";

const GATHER_RETRY_PROMPT =
  "I didn't get a response from you. Press 1 to receive texts, or press 2 to skip.";

const IN_CALL_CONFIRM_YES =
  "Thanks. You are opted in to receive text messages from CallReady. " +
  "Message and data rates may apply. You can opt out any time by replying STOP. " +
  "Thanks for practicing today. Have a great day and call again soon!";

const IN_CALL_CONFIRM_NO =
  "No problem. You will not receive text messages from CallReady. " +
  "Thanks for practicing with us today. We hope to hear from you again soon. Have a great day and call again soon!";

const OPTIN_CONFIRM_SMS =
  "Welcome to CallReady.live, a place to practice phone calls until they feel familiar. You are opted in to receive texts. Msg and data rates may apply. " +
  "Reply STOP any time to opt out. " +
  "Learn more at https://callready.live";

const POST_CALL_FOLLOWUP_SMS_1 =
  "Thanks for practicing with CallReady.live today. I hope the call feels a little more familiar now.";

const POST_CALL_FOLLOWUP_SMS_2 =
  "Nice work practicing today with CallReady.live. Repetition is what makes phone calls start to feel manageable.";

const POST_CALL_FOLLOWUP_SMS_3 =
  "Good practice today. If calls feel awkward sometimes, that is normal. With CallReady.live, you can try again anytime.";

const REENGAGE_SMS_1 =
  "Just checking in. If phone calls feel hard again, you can practice with CallReady.live anytime. No pressure.";

const REENGAGE_SMS_2 =
  "A quick note from CallReady.live. If you want a low-pressure practice call, you can jump back in anytime.";

const TWILIO_NO_MINUTES_LEFT =
  "Welcome back to CallReady dot live, a place to practice phone calls until they feel familiar.  It looks like you do not have any practice sessions remaining on your membership for this month. " +
  "To get more sessions, please visit CallReady dot live. " +
  "Thanks for calling, and we hope you will practice again soon!";

const TWILIO_NO_SESSIONS_LEFT =
  "Welcome back to CallReady dot live, a place to practice phone calls until they feel familiar. It looks like you do not have any practice sessions remaining on your membership for this month. " +
  "To get more sessions, please visit CallReady dot live. " +
  "Thanks for calling, and we hope you will practice again soon!";

const TWILIO_SERVICE_UNAVAILABLE =
  "CallReady dot live is temporarily unavailable right now. Please try again in a little bit. Goodbye.";

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

async function sendSms(toPhoneE164, bodyText, eventType) {
  if (!toPhoneE164) return { ok: false, error: "missing_to" };
  if (!bodyText) return { ok: false, error: "missing_body" };
  if (!hasTwilioRest()) return { ok: false, error: "missing_twilio_rest_creds" };

  const client = twilioClient();
  if (!client) return { ok: false, error: "no_twilio_client" };

  const payload = {
    to: String(toPhoneE164).trim(),
    body: String(bodyText)
  };

  if (TWILIO_MESSAGING_SERVICE_SID) {
    payload.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
  } else if (TWILIO_SMS_FROM) {
    payload.from = TWILIO_SMS_FROM;
  } else {
    return { ok: false, error: "missing_sms_from_or_messaging_service" };
  }

  try {
    const msg = await client.messages.create(payload);
    console.log(nowIso(), "Sent SMS", { to: payload.to, sid: msg && msg.sid ? msg.sid : null });
    try {
      if (pool) {
        await pool.query(
          "insert into sms_events (phone_e164, event_type, message_sid, body_text) values ($1, $2, $3, $4)",
          [payload.to, (eventType ? String(eventType) : "sms_sent"), (msg && msg.sid ? String(msg.sid) : null), payload.body]
        );
      }
    } catch (e) {
      console.log(nowIso(), "DB insert failed for sms_events:", e && e.message ? e.message : e);
    }

    return { ok: true, sid: msg && msg.sid ? msg.sid : null };
  } catch (e) {
    console.log(nowIso(), "Failed to send SMS", {
      to: payload.to,
      error: e && e.message ? e.message : e
    });
    return { ok: false, error: e && e.message ? e.message : "send_failed" };
  }
}

async function hasRecentSmsEvent(phoneE164, eventType, withinDays) {
  if (!pool) return false;
  if (!phoneE164) return false;
  if (!eventType) return false;

  const days = parseInt(String(withinDays || "7"), 10);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 7;

  try {
    const r = await pool.query(
      "select 1 from sms_events " +
      "where phone_e164 = $1 and event_type = $2 and sent_at >= (now() - ($3::int * interval '1 day')) " +
      "limit 1",
      [String(phoneE164), String(eventType), safeDays]
    );

    return !!(r && r.rowCount && r.rowCount > 0);
  } catch (e) {
    console.log(nowIso(), "DB lookup failed for sms_events recent check:", e && e.message ? e.message : e);
    return false;
  }
}

async function getNextPostCallMessage(phoneE164) {
  if (!pool) return POST_CALL_FOLLOWUP_SMS_1;
  if (!phoneE164) return POST_CALL_FOLLOWUP_SMS_1;

  try {
    const r = await pool.query(
      "select body_text from sms_events " +
      "where phone_e164 = $1 and event_type = 'post_call_followup' " +
      "order by sent_at desc limit 1",
      [String(phoneE164)]
    );

    const last = r && r.rows && r.rows[0] ? r.rows[0].body_text : null;

    if (last === POST_CALL_FOLLOWUP_SMS_1) return POST_CALL_FOLLOWUP_SMS_2;
    if (last === POST_CALL_FOLLOWUP_SMS_2) return POST_CALL_FOLLOWUP_SMS_3;
    return POST_CALL_FOLLOWUP_SMS_1;
  } catch (e) {
    console.log(nowIso(), "DB lookup failed for post-call SMS rotation:", e && e.message ? e.message : e);
    return POST_CALL_FOLLOWUP_SMS_1;
  }
}

async function hasLongBreakSinceLastCall(phoneE164, days) {
  if (!pool) return false;
  if (!phoneE164) return false;

  const d = parseInt(String(days || "30"), 10);
  const safeDays = Number.isFinite(d) && d > 0 ? d : 30;

  try {
    const r = await pool.query(
      "select 1 from calls " +
      "where phone_e164 = $1 and should_count = true " +
      "and ended_at >= (now() - ($2::int * interval '1 day')) " +
      "limit 1",
      [String(phoneE164), safeDays]
    );

    return !(r && r.rowCount && r.rowCount > 0);
  } catch (e) {
    console.log(nowIso(), "DB lookup failed for long-break check:", e && e.message ? e.message : e);
    return false;
  }
}

async function getNextReengageMessage(phoneE164) {
  if (!pool) return REENGAGE_SMS_1;
  if (!phoneE164) return REENGAGE_SMS_1;

  try {
    const r = await pool.query(
      "select body_text from sms_events " +
      "where phone_e164 = $1 and event_type = 'reengage' " +
      "order by sent_at desc limit 1",
      [String(phoneE164)]
    );

    const last = r && r.rows && r.rows[0] ? r.rows[0].body_text : null;

    if (last === REENGAGE_SMS_1) return REENGAGE_SMS_2;
    return REENGAGE_SMS_1;
  } catch (e) {
    console.log(nowIso(), "DB lookup failed for re-engage SMS rotation:", e && e.message ? e.message : e);
    return REENGAGE_SMS_1;
  }
}

function monthBucketFirstDayUtc() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

function toInt(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function toMs(v) {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseIntOrDefault(v, d) {
  const n = parseInt(String(v || ""), 10);
  return Number.isFinite(n) ? n : d;
}

const FREE_MONTHLY_MINUTES = parseIntOrDefault(process.env.FREE_MONTHLY_MINUTES, 20);
const MEMBER_MONTHLY_MINUTES = parseIntOrDefault(process.env.MEMBER_MONTHLY_MINUTES, 120);
const POWER_MONTHLY_MINUTES = parseIntOrDefault(process.env.POWER_MONTHLY_MINUTES, 400);

const FREE_PER_CALL_SECONDS = parseIntOrDefault(process.env.FREE_PER_CALL_SECONDS, 300);
const MEMBER_PER_CALL_SECONDS = parseIntOrDefault(process.env.MEMBER_PER_CALL_SECONDS, 9999);
const POWER_PER_CALL_SECONDS = parseIntOrDefault(process.env.POWER_PER_CALL_SECONDS, 9999);

function tierMonthlyAllowanceSeconds(tier) {
  const t = String(tier || "free").toLowerCase();
  if (t === "power" || t === "power_user" || t === "poweruser") return POWER_MONTHLY_MINUTES * 60;
  if (t === "member") return MEMBER_MONTHLY_MINUTES * 60;
  return FREE_MONTHLY_MINUTES * 60;
}

function tierPerCallCapSeconds(tier) {
  const t = String(tier || "free").toLowerCase();

  // If MEMBER_PER_CALL_SECONDS or POWER_PER_CALL_SECONDS is 0, treat that as "no per-call cap".
  if (t === "power" || t === "power_user" || t === "poweruser") {
    return POWER_PER_CALL_SECONDS > 0 ? POWER_PER_CALL_SECONDS : null;
  }
  if (t === "member") {
    return MEMBER_PER_CALL_SECONDS > 0 ? MEMBER_PER_CALL_SECONDS : null;
  }
  return FREE_PER_CALL_SECONDS;
}

async function getThresholdsForPhone(phoneE164) {
  if (!pool) return { soft: 240, hard: 420 };

  try {
    const r = await pool.query(
      "select tier from callers where phone_e164 = $1 limit 1",
      [phoneE164]
    );

    const tier =
      r && r.rows && r.rows[0] && r.rows[0].tier != null
        ? String(r.rows[0].tier).toLowerCase()
        : "free";

    // Free: soft 4 minutes, hard 7 minutes
    if (tier === "free") return { soft: 240, hard: 420 };

    // Member and Member Plus: soft 8 minutes, hard 12 minutes
    if (tier === "member" || tier === "power" || tier === "power_user" || tier === "poweruser") {
      return { soft: 480, hard: 720 };
    }

    // Fallback
    return { soft: 240, hard: 420 };
  } catch (e) {
    return { soft: 240, hard: 420 };
  }
}

function startLiveSessionThresholdTimers(opts) {
  // Soft threshold: set callState.overSoftThresholdLive = true, do not end the call.
  // Hard ceiling: invoke opts.onHardCeiling(), which we will wire to a graceful closing path next.
  if (!opts || !opts.callState) return;

  var callState = opts.callState;
  var softSeconds = Number(opts.softThresholdSeconds || 0);
  var hardSeconds = Number(opts.hardCeilingSeconds || 0);

  if (typeof callState.overSoftThresholdLive !== "boolean") {
    callState.overSoftThresholdLive = false;
  }

  if (callState.softThresholdTimerId) {
    clearTimeout(callState.softThresholdTimerId);
    callState.softThresholdTimerId = null;
  }
  if (callState.hardCeilingTimerId) {
    clearTimeout(callState.hardCeilingTimerId);
    callState.hardCeilingTimerId = null;
  }

  if (softSeconds > 0) {
    callState.softThresholdTimerId = setTimeout(function () {
      callState.overSoftThresholdLive = true;

      try {
        console.log(nowIso(), "Soft threshold crossed for live call", {
          callSid: callState.callSid || null,
          softThresholdSeconds: softSeconds
        });
      } catch (e) { }
    }, softSeconds * 1000);
  }

  if (hardSeconds > 0) {
    callState.hardCeilingTimerId = setTimeout(function () {
      try {
        console.log(nowIso(), "Hard ceiling reached for live call", {
          callSid: callState.callSid || null,
          hardCeilingSeconds: hardSeconds
        });
      } catch (e) { }

      if (typeof opts.onHardCeiling === "function") {
        opts.onHardCeiling();
      }
    }, hardSeconds * 1000);
  }
}

function clearLiveSessionThresholdTimers(callState) {
  if (!callState) return;

  if (callState.softThresholdTimerId) {
    clearTimeout(callState.softThresholdTimerId);
    callState.softThresholdTimerId = null;
  }
  if (callState.hardCeilingTimerId) {
    clearTimeout(callState.hardCeilingTimerId);
    callState.hardCeilingTimerId = null;
  }
}


async function upsertCallerOnCallStart(fromPhoneE164, callSid) {
  if (!pool) return;
  if (!fromPhoneE164) return;

  const bucket = monthBucketFirstDayUtc();

  try {
    await pool.query(
      "insert into callers (" +
      "phone_e164, first_call_at, last_call_at, total_calls, tier, " +
      "month_bucket, monthly_seconds_used, per_call_seconds_cap, last_call_sid, " +
      "cycle_anchor_at, cycle_ends_at, cycle_seconds_used" +
      ") values (" +
      "$1, now(), now(), 1, 'free', " +
      "$2::date, 0, $3, $4, " +
      "now(), (now() + interval '1 month'), 0" +
      ") on conflict (phone_e164) do update set " +
      "last_call_at = now(), " +
      "total_calls = callers.total_calls + 1, " +
      "last_call_sid = $4, " +
      "first_call_at = coalesce(callers.first_call_at, now()), " +
      "month_bucket = $2::date, " +
      "monthly_seconds_used = case when callers.month_bucket is distinct from $2::date then 0 else callers.monthly_seconds_used end, " +
      "cycle_anchor_at = coalesce(callers.cycle_anchor_at, callers.first_call_at, callers.created_at, now()), " +
      "cycle_ends_at = coalesce(callers.cycle_ends_at, (coalesce(callers.cycle_anchor_at, callers.first_call_at, callers.created_at, now()) + interval '1 month')), " +
      "cycle_seconds_used = coalesce(callers.cycle_seconds_used, 0)",
      [fromPhoneE164, bucket, FREE_PER_CALL_SECONDS, callSid || null]
    );

    console.log(nowIso(), "Upserted caller row", {
      phone_e164: fromPhoneE164,
      callSid: callSid || null,
    });
  } catch (e) {
    console.log(nowIso(), "DB upsert failed for callers:", e && e.message ? e.message : e);
  }
}

async function setCallerSmsOptInState(fromPhoneE164, optedIn) {
  if (!pool) return;
  if (!fromPhoneE164) return;

  try {
    if (optedIn) {
      await pool.query(
        "update callers set sms_opted_in = true, sms_opted_in_at = now(), sms_last_keyword = 'DTMF_OPTIN', sms_opted_out_at = null where phone_e164 = $1",
        [fromPhoneE164]
      );
    } else {
      await pool.query(
        "update callers set sms_opted_in = false, sms_opted_out_at = now(), sms_last_keyword = 'DTMF_DECLINE' where phone_e164 = $1",
        [fromPhoneE164]
      );
    }

    console.log(nowIso(), "Updated callers sms_opted_in", {
      phone_e164: fromPhoneE164,
      sms_opted_in: !!optedIn,
    });
  } catch (e) {
    console.log(nowIso(), "DB update failed for callers sms state:", e && e.message ? e.message : e);
  }
}

async function logCallStartToDb(callSid, fromPhoneE164) {
  if (!pool) return;

  try {
    await pool.query(
      "insert into calls (call_sid, phone_e164, started_at, minutes_cap_applied) values ($1, $2, now(), $3) " +
      "on conflict (call_sid) do update set phone_e164 = coalesce(calls.phone_e164, excluded.phone_e164)",
      [callSid, fromPhoneE164 || null, Math.ceil(FREE_PER_CALL_SECONDS / 60)]
    );

    console.log(nowIso(), "Logged call start to DB", {
      callSid,
      phone_e164: fromPhoneE164 || null,
      minutes_cap_applied: Math.ceil(FREE_PER_CALL_SECONDS / 60),
    });
  } catch (e) {
    console.log(nowIso(), "DB insert failed for calls start:", e && e.message ? e.message : e);
  }

  try {
    await upsertCallerOnCallStart(fromPhoneE164, callSid);
  } catch { }
}

async function applyTierForIncomingCall(fromPhoneE164, callSid) {
  if (!pool) {
    return {
      allowed: true,
      tier: "free",
      remainingSeconds: tierMonthlyAllowanceSeconds("free"),
      perCallCapSeconds: FREE_PER_CALL_SECONDS,
      totalCalls: 1,
    };
  }

  if (!fromPhoneE164) {
    return {
      allowed: true,
      tier: "free",
      remainingSeconds: tierMonthlyAllowanceSeconds("free"),
      perCallCapSeconds: FREE_PER_CALL_SECONDS,
      totalCalls: 1,
    };
  }

  const bucket = monthBucketFirstDayUtc();
  const nowMs = Date.now();

  try {
    const r = await pool.query(
      "select tier, total_calls, per_call_seconds_cap, " +
      "cycle_anchor_at, cycle_ends_at, cycle_seconds_used, " +
      "cycle_sessions_used, cycle_sessions_cap " +
      "from callers where phone_e164 = $1 limit 1",
      [fromPhoneE164]
    );


    const row = r && r.rows && r.rows[0] ? r.rows[0] : null;

    const tier = row && row.tier ? String(row.tier) : "free";
    const totalCalls = row ? toInt(row.total_calls, 1) : 1;

    const cycleEndsMs = row ? toMs(row.cycle_ends_at) : null;

    if (!cycleEndsMs || nowMs >= cycleEndsMs) {
      try {
        await pool.query(
          "update callers set " +
          "cycle_anchor_at = now(), " +
          "cycle_ends_at = (now() + interval '1 month'), " +
          "cycle_seconds_used = 0, " +
          "cycle_sessions_used = 0 " +
          "where phone_e164 = $1",
          [fromPhoneE164]
        );


        console.log(nowIso(), "Cycle rolled over and reset", {
          phone_e164: fromPhoneE164,
          prior_cycle_ends_at: row && row.cycle_ends_at ? String(row.cycle_ends_at) : null,
        });
      } catch (e) {
        console.log(nowIso(), "Cycle rollover update failed:", e && e.message ? e.message : e);
      }
    }

    const r2 = await pool.query(
      "select tier, total_calls, per_call_seconds_cap, " +
      "cycle_anchor_at, cycle_ends_at, cycle_seconds_used, " +
      "cycle_sessions_used, cycle_sessions_cap " +
      "from callers where phone_e164 = $1 limit 1",
      [fromPhoneE164]
    );


    const row2 = r2 && r2.rows && r2.rows[0] ? r2.rows[0] : null;

    const tier2 = row2 && row2.tier ? String(row2.tier) : tier;
    const totalCalls2 = row2 ? toInt(row2.total_calls, totalCalls) : totalCalls;

    const used = row2 ? toInt(row2.cycle_seconds_used, 0) : 0;
    const sessionsUsed = row2 ? toInt(row2.cycle_sessions_used, 0) : 0;
    const sessionsCap = row2 ? toInt(row2.cycle_sessions_cap, 0) : 0;

    let sessionsRemaining = sessionsCap - sessionsUsed;
    if (!Number.isFinite(sessionsRemaining)) sessionsRemaining = 0;
    if (sessionsRemaining < 0) sessionsRemaining = 0;

    const remaining = 0;

    const baseCap = tierPerCallCapSeconds(tier2);

    // Session-based memberships:
    // perCallCapSeconds is the per-session cap for the tier, not dependent on remaining time.
    // For tiers with no per-session cap, use a large number so callers still have a sane value.
    const perCallCapSeconds = 0;

    if (perCallCapSeconds > 0) {
      try {
        const tWrite = String(tier2 || "free").toLowerCase();
        const shouldWriteCap = tWrite === "free";

        if (shouldWriteCap) {
          await pool.query(
            "update callers set per_call_seconds_cap = $2, month_bucket = $3::date, monthly_seconds_used = case when month_bucket is distinct from $3::date then 0 else monthly_seconds_used end where phone_e164 = $1",
            [fromPhoneE164, perCallCapSeconds, bucket]
          );
        } else {
          await pool.query(
            "update callers set per_call_seconds_cap = null, month_bucket = $2::date, monthly_seconds_used = case when month_bucket is distinct from $2::date then 0 else monthly_seconds_used end where phone_e164 = $1",
            [fromPhoneE164, bucket]
          );
        }
      } catch { }
    }


    try {
      if (callSid) {
        await pool.query(
          "update calls set minutes_cap_applied = $2 where call_sid = $1",
          [callSid, Math.ceil(perCallCapSeconds / 60)]
        );
      }
    } catch { }

    const allowed = sessionsRemaining > 0;


    console.log(nowIso(), "Tier check", {
      phone_e164: fromPhoneE164,
      tier: tier2,
      sessions_used: sessionsUsed,
      sessions_cap: sessionsCap,
      remainingSeconds: remaining,
      perCallCapSeconds,
      allowed,
      totalCalls: totalCalls2,
      cycle_anchor_at: row2 && row2.cycle_anchor_at ? String(row2.cycle_anchor_at) : null,
      cycle_ends_at: row2 && row2.cycle_ends_at ? String(row2.cycle_ends_at) : null,
      cycle_seconds_used: used,
    });

    return {
      allowed,
      tier: tier2,
      remainingSeconds: remaining,
      perCallCapSeconds,
      totalCalls: totalCalls2,
      cycle_sessions_used: sessionsUsed,
      cycle_sessions_cap: sessionsCap
    };

  } catch (e) {
    console.log(nowIso(), "DB tier check failed, defaulting to free:", e && e.message ? e.message : e);

    return {
      allowed: true,
      tier: "free",
      remainingSeconds: tierMonthlyAllowanceSeconds("free"),
      perCallCapSeconds: FREE_PER_CALL_SECONDS,
      totalCalls: 1,
    };
  }
}

async function logAiUsageToDb(callSid, usageSummary) {
  if (!pool) return;
  if (!callSid) return;
  if (!usageSummary) return;

  try {
    const r = await pool.query("select phone_e164 from calls where call_sid = $1 limit 1", [callSid]);
    const phone = r && r.rows && r.rows[0] && r.rows[0].phone_e164 ? String(r.rows[0].phone_e164) : null;

    let tier = null;
    try {
      if (phone) {
        const r2 = await pool.query("select tier from callers where phone_e164 = $1 limit 1", [phone]);
        tier = r2 && r2.rows && r2.rows[0] && r2.rows[0].tier ? String(r2.rows[0].tier) : null;
      }
    } catch { }

    const endedAtIso = usageSummary.endedAtIso ? String(usageSummary.endedAtIso) : nowIso();
    const startedAtIso = usageSummary.startedAtIso ? String(usageSummary.startedAtIso) : null;

    await pool.query(
      "insert into call_ai_usage (" +
      "call_sid, phone_e164, tier, model, openai_session_id, started_at, ended_at, duration_seconds, turns, " +
      "total_tokens, input_tokens, output_tokens, " +
      "input_text_tokens, input_audio_tokens, output_text_tokens, output_audio_tokens, " +
      "estimated_cost_usd" +
      ") values (" +
      "$1, $2, $3, $4, $5, " +
      "coalesce($6::timestamptz, now()), $7::timestamptz, $8, $9, " +
      "$10, $11, $12, " +
      "$13, $14, $15, $16, " +
      "$17" +
      ") on conflict (call_sid) do update set " +
      "tier = excluded.tier, " +
      "model = excluded.model, " +
      "openai_session_id = excluded.openai_session_id, " +
      "started_at = excluded.started_at, " +
      "ended_at = excluded.ended_at, " +
      "duration_seconds = excluded.duration_seconds, " +
      "turns = excluded.turns, " +
      "total_tokens = excluded.total_tokens, " +
      "input_tokens = excluded.input_tokens, " +
      "output_tokens = excluded.output_tokens, " +
      "input_text_tokens = excluded.input_text_tokens, " +
      "input_audio_tokens = excluded.input_audio_tokens, " +
      "output_text_tokens = excluded.output_text_tokens, " +
      "output_audio_tokens = excluded.output_audio_tokens, " +
      "estimated_cost_usd = excluded.estimated_cost_usd",
      [
        callSid,
        phone,
        tier,
        usageSummary.model || OPENAI_REALTIME_MODEL,
        usageSummary.openaiSessionId || null,
        startedAtIso,
        endedAtIso,
        usageSummary.durationSec || null,
        usageSummary.turns || 0,
        (usageSummary.totals && usageSummary.totals.total_tokens) || 0,
        (usageSummary.totals && usageSummary.totals.input_tokens) || 0,
        (usageSummary.totals && usageSummary.totals.output_tokens) || 0,
        (usageSummary.totals && usageSummary.totals.input_text_tokens) || 0,
        (usageSummary.totals && usageSummary.totals.input_audio_tokens) || 0,
        (usageSummary.totals && usageSummary.totals.output_text_tokens) || 0,
        (usageSummary.totals && usageSummary.totals.output_audio_tokens) || 0,
        typeof usageSummary.estimatedCostUSD === "number" ? usageSummary.estimatedCostUSD : null
      ]
    );

    console.log(nowIso(), "Logged AI usage to DB", { callSid: callSid, tier: tier, phone_e164: phone });
  } catch (e) {
    console.log(nowIso(), "DB insert failed for call_ai_usage:", e && e.message ? e.message : e);
  }
}

async function logCallEndToDb(callSid, endedReason) {
  if (!pool) return;
  if (!callSid) return;

  try {
    const upd = await pool.query(
      "with u as ( " +
      "update calls set ended_at = now(), ended_reason = $2, duration_seconds = extract(epoch from (now() - started_at))::int " +
      "where call_sid = $1 and ended_at is null " +
      "returning phone_e164, duration_seconds " +
      ") " +
      "select phone_e164, duration_seconds from u",
      [callSid, endedReason || null]
    );

    const row = upd && upd.rows && upd.rows[0] ? upd.rows[0] : null;

    console.log(nowIso(), "Logged call end to DB", {
      callSid,
      ended_reason: endedReason || null,
      duration_seconds: row ? toInt(row.duration_seconds, 0) : null,
      phone_e164: row && row.phone_e164 ? row.phone_e164 : null,
    });

    if (!row || !row.phone_e164) return;

    const dur = toInt(row.duration_seconds, 0);
    const thresholds = await getThresholdsForPhone(row.phone_e164);

    const overSoft = dur > thresholds.soft;
    const hitHard = dur >= thresholds.hard;

    // Counts only if it was a real attempt
    const shouldCount = dur >= 60;

    try {
      await pool.query(
        "update calls set " +
        "soft_threshold_seconds = $2, " +
        "hard_ceiling_seconds = $3, " +
        "over_soft_threshold = $4, " +
        "hit_hard_ceiling = $5, " +
        "should_count = $6 " +
        "where call_sid = $1",
        [callSid, thresholds.soft, thresholds.hard, overSoft, hitHard, shouldCount]
      );

      console.log(nowIso(), "Classified call", {
        callSid,
        phone_e164: row.phone_e164,
        duration_seconds: dur,
        soft_threshold_seconds: thresholds.soft,
        hard_ceiling_seconds: thresholds.hard,
        over_soft_threshold: overSoft,
        hit_hard_ceiling: hitHard,
        should_count: shouldCount,
      });
      if (shouldCount && row.phone_e164) {
        const recentlyMessaged = await hasRecentSmsEvent(
          row.phone_e164,
          "post_call_followup",
          7
        );

        if (!recentlyMessaged) {
          try {
            const nextMsg = await getNextPostCallMessage(row.phone_e164);
            await sendSms(row.phone_e164, nextMsg, "post_call_followup");

            console.log(nowIso(), "Post-call follow-up SMS sent", { phone_e164: row.phone_e164 });
          } catch (e) {
            console.log(nowIso(), "Post-call follow-up SMS failed", e && e.message ? e.message : e);
          }
        } else {
          console.log(nowIso(), "Skipping post-call SMS due to weekly cap", { phone_e164: row.phone_e164 });
        }
      }

    } catch (e) {
      console.log(
        nowIso(),
        "DB update failed for calls classification:",
        e && e.message ? e.message : e
      );
    }

    if (dur > 0 && shouldCount) {
      try {
        await pool.query(
          "update callers set " +
          "cycle_seconds_used = coalesce(cycle_seconds_used, 0) + $2, " +
          "cycle_sessions_used = coalesce(cycle_sessions_used, 0) + 1, " +
          "last_call_sid = $3 " +
          "where phone_e164 = $1",
          [row.phone_e164, dur, callSid]
        );

        console.log(nowIso(), "Updated callers usage", {
          phone_e164: row.phone_e164,
          added_seconds: dur,
          added_session: true,
        });
      } catch (e) {
        console.log(
          nowIso(),
          "DB update failed for callers usage:",
          e && e.message ? e.message : e
        );
      }
    }
  } catch (e) {
    console.log(nowIso(), "DB update failed for calls end:", e && e.message ? e.message : e);
  }
}


function fireAndForgetCallEndLog(callSid, endedReason) {
  try {
    logCallEndToDb(callSid, endedReason).catch((e) => {
      console.log(nowIso(), "DB update failed for calls end (async):", e && e.message ? e.message : e);
    });
  } catch { }
}

async function fetchPriorCallContextByCallSid(callSid) {
  if (!pool) return null;
  if (!callSid) return null;

  try {
    const cur = await pool.query("select phone_e164 from calls where call_sid = $1 limit 1", [callSid]);

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
    console.log(nowIso(), "DB fetch failed for prior call context:", e && e.message ? e.message : e);
    return null;
  }
}

async function fetchCallerRuntimeContextByCallSid(callSid) {
  if (!pool) return null;
  if (!callSid) return null;

  try {
    const r = await pool.query(
      "select c.phone_e164, cl.tier, cl.total_calls, cl.per_call_seconds_cap, cl.sms_opted_in, " +
      "cl.cycle_anchor_at, cl.cycle_ends_at, cl.cycle_seconds_used, " +
      "cl.cycle_sessions_used, cl.cycle_sessions_cap " +
      "from calls c join callers cl on cl.phone_e164 = c.phone_e164 " +
      "where c.call_sid = $1 limit 1",
      [callSid]
    );

    const row = r && r.rows && r.rows[0] ? r.rows[0] : null;
    if (!row) return null;

    const tier = row.tier ? String(row.tier) : "free";
    const used = toInt(row.cycle_seconds_used, 0);
    const remaining = 0;

    let perCallCapSeconds = 0;
    const tierLower = String(tier || "free").toLowerCase();

    if (tierLower === "free") {
      perCallCapSeconds = toInt(row.per_call_seconds_cap, tierPerCallCapSeconds(tier));
    } else {
      perCallCapSeconds = 0;
    }

    return {
      phone_e164: row.phone_e164 || null,
      tier,
      remainingSeconds: remaining,
      perCallCapSeconds,
      totalCalls: toInt(row.total_calls, 1),
      sms_opted_in: !!row.sms_opted_in,
      cycle_anchor_at: row.cycle_anchor_at ? String(row.cycle_anchor_at) : null,
      cycle_ends_at: row.cycle_ends_at ? String(row.cycle_ends_at) : null,
      cycle_seconds_used: used,
      cycle_sessions_used: toInt(row.cycle_sessions_used, 0),
      cycle_sessions_cap: toInt(row.cycle_sessions_cap, 0),

    };
  } catch (e) {
    console.log(nowIso(), "DB fetch failed for caller runtime context:", e && e.message ? e.message : e);
    return null;
  }
}

async function setScenarioTagOnce(callSid, tag) {
  if (!pool) return;
  if (!callSid) return;
  if (!tag) return;

  try {
    await pool.query("update calls set scenario_tag = coalesce(scenario_tag, $2) where call_sid = $1", [
      callSid,
      tag,
    ]);
    console.log(nowIso(), "Set scenario_tag (once)", { callSid, scenario_tag: tag });
  } catch (e) {
    console.log(nowIso(), "DB update failed for scenario_tag:", e && e.message ? e.message : e);
  }
}

async function appendScenarioSummaryToCall(callSid, summaryText) {
  if (!pool) return;
  if (!callSid) return;
  if (!summaryText) return;

  const clean = String(summaryText).trim();
  if (!clean) return;

  try {
    await pool.query(
      "update calls set last_focus_skill = " +
      "case " +
      "when last_focus_skill is null or last_focus_skill = '' then $2 " +
      "when position($2 in last_focus_skill) > 0 then last_focus_skill " +
      "else (last_focus_skill || ' | ' || $2) " +
      "end " +
      "where call_sid = $1",
      [callSid, clean]
    );

    console.log(nowIso(), "Appended scenario summary to call", { callSid: callSid, summary: clean });
  } catch (e) {
    console.log(nowIso(), "DB update failed for scenario summary:", e && e.message ? e.message : e);
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
  return null;
}

async function isAlreadyOptedInByPhone(fromPhoneE164) {
  if (!pool) return false;
  if (!fromPhoneE164) return false;

  try {
    const r1 = await pool.query("select sms_opted_in from callers where phone_e164 = $1 limit 1", [fromPhoneE164]);
    if (r1 && r1.rowCount > 0) {
      return !!r1.rows[0].sms_opted_in;
    }
  } catch (e) {
    console.log(nowIso(), "DB lookup failed for callers sms check:", e && e.message ? e.message : e);
  }

  try {
    const r = await pool.query("select 1 from sms_optins where from_phone = $1 and opted_in = true limit 1", [
      fromPhoneE164,
    ]);
    return r && r.rowCount > 0;
  } catch (e) {
    console.log(nowIso(), "DB lookup failed for sms_optins prior opt-in check:", e && e.message ? e.message : e);
    return false;
  }
}

app.get("/", (req, res) => res.status(200).send("CallReady server up"));

app.get("/health", (req, res) => res.status(200).json({ ok: true, version: CALLREADY_VERSION }));
app.get("/healthz", (req, res) => res.status(200).json({ ok: true, version: CALLREADY_VERSION }));
app.get("/route-check", (req, res) => res.status(200).send("route-check-ok"));
app.get("/cron/reengage", async (req, res) => {
  try {
    const provided =
      (req.headers && req.headers["x-cron-secret"] ? String(req.headers["x-cron-secret"]) : "") ||
      (req.query && req.query.secret ? String(req.query.secret) : "");

    if (!REENGAGE_CRON_SECRET || provided !== String(REENGAGE_CRON_SECRET)) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    if (!pool) {
      res.status(500).json({ ok: false, error: "db_not_configured" });
      return;
    }

    const lookbackDays = 30;

    // Find opted-in callers who have NOT had a counted call in the last 30 days
    // and who have NOT received a re-engagement text in the last 30 days.
    const q =
      "select c.phone_e164 as phone_e164 " +
      "from callers c " +
      "where c.sms_opted_in = true " +
      "and not exists ( " +
      "  select 1 from calls ca " +
      "  where ca.phone_e164 = c.phone_e164 " +
      "  and ca.should_count = true " +
      "  and ca.ended_at is not null " +
      "  and ca.ended_at >= (now() - ($1::int * interval '1 day')) " +
      ") " +
      "and not exists ( " +
      "  select 1 from sms_events se " +
      "  where se.phone_e164 = c.phone_e164 " +
      "  and se.event_type = 'reengage' " +
      "  and se.sent_at >= (now() - ($1::int * interval '1 day')) " +
      ") " +
      "limit 50";

    const r = await pool.query(q, [lookbackDays]);
    const rows = r && r.rows ? r.rows : [];

    let attempted = 0;
    let sent = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const phone = rows[i] && rows[i].phone_e164 ? String(rows[i].phone_e164) : "";
      if (!phone) continue;

      attempted += 1;

      // Extra safety: confirm long break using the helper
      const longBreak = await hasLongBreakSinceLastCall(phone, lookbackDays);
      if (!longBreak) {
        continue;
      }

      try {
        const msgText = await getNextReengageMessage(phone);
        const result = await sendSms(phone, msgText, "reengage");
        if (result && result.ok) sent += 1;
      } catch (e) {
        console.log(nowIso(), "Re-engage send failed", { phone_e164: phone, error: e && e.message ? e.message : e });
      }
    }

    res.status(200).json({ ok: true, candidates: rows.length, attempted: attempted, sent: sent });
  } catch (e) {
    console.log(nowIso(), "cron/reengage error:", e && e.message ? e.message : e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.get("/stripe-webhook", (req, res) => {
  res.status(200).send("stripe-webhook-ok");
});
app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    if (!stripe) {
      console.log(nowIso(), "stripe-webhook: Stripe not configured");
      res.status(500).send("Stripe not configured");
      return;
    }

    if (!STRIPE_WEBHOOK_SECRET) {
      console.log(nowIso(), "stripe-webhook: Missing STRIPE_WEBHOOK_SECRET");
      res.status(500).send("Missing webhook secret");
      return;
    }

    const sig = req.headers && req.headers["stripe-signature"] ? String(req.headers["stripe-signature"]) : "";

    if (!sig) {
      console.log(nowIso(), "stripe-webhook: Missing stripe-signature header");
      res.status(400).send("Missing signature");
      return;
    }

    const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    if (event && event.type === "checkout.session.completed") {
      const session = event.data && event.data.object ? event.data.object : null;
      const md = session && session.metadata ? session.metadata : null;

      console.log(nowIso(), "checkout.session.completed metadata", {
        practice_phone: md && md.practice_phone ? String(md.practice_phone) : null,
        tier: md && md.tier ? String(md.tier) : null,
        customer: session && session.customer ? String(session.customer) : null,
        subscription: session && session.subscription ? String(session.subscription) : null,
      });
      if (pool && md && md.practice_phone && md.tier) {
        const phone = String(md.practice_phone).trim();
        const tier = String(md.tier).toLowerCase();

        try {
          const newSessionsCap =
            tier === "power" || tier === "power_user" || tier === "poweruser"
              ? 30
              : tier === "member"
                ? 12
                : 4;

          await pool.query(
            "insert into callers (phone_e164, tier, cycle_anchor_at, cycle_ends_at, cycle_seconds_used, cycle_sessions_used, cycle_sessions_cap) " +
            "values ($1, $2, now(), (now() + interval '1 month'), 0, 0, $3) " +
            "on conflict (phone_e164) do update set " +
            "tier = excluded.tier, " +
            "cycle_anchor_at = now(), " +
            "cycle_ends_at = (now() + interval '1 month'), " +
            "cycle_seconds_used = 0, " +
            "cycle_sessions_used = 0, " +
            "cycle_sessions_cap = $3",
            [phone, tier, newSessionsCap]
          );


          console.log(nowIso(), "Upgraded caller tier from checkout", {
            phone_e164: phone,
            tier: tier,
          });

          const customerId = session && session.customer ? String(session.customer) : "";
          const subscriptionId = session && session.subscription ? String(session.subscription) : "";

          if (customerId && subscriptionId) {
            try {
              await pool.query(
                "insert into billing_subscriptions (phone_e164, stripe_customer_id, stripe_subscription_id, stripe_status, created_at, updated_at) " +
                "values ($1, $2, $3, $4, now(), now()) " +
                "on conflict (phone_e164) do update set " +
                "stripe_customer_id = excluded.stripe_customer_id, " +
                "stripe_subscription_id = excluded.stripe_subscription_id, " +
                "stripe_status = excluded.stripe_status, " +
                "updated_at = now()",
                [phone, customerId, subscriptionId, "active"]
              );

              console.log(nowIso(), "Upserted billing_subscriptions from checkout", {
                phone_e164: phone,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                stripe_status: "active",
              });


            } catch (e) {
              console.log(nowIso(), "Failed to upsert billing_subscriptions:", e && e.message ? e.message : e);
            }
          } else {
            console.log(nowIso(), "checkout.session.completed missing customer or subscription id");
          }

        } catch (e) {
          console.log(nowIso(), "Failed to upgrade caller tier:", e && e.message ? e.message : e);
        }
      } else {
        console.log(nowIso(), "checkout.session.completed missing metadata or DB not configured");
      }
    }

    if (event && (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated")) {
      const sub = event.data && event.data.object ? event.data.object : null;

      const customerId = sub && sub.customer ? String(sub.customer) : "";
      const subscriptionId = sub && sub.id ? String(sub.id) : "";
      const status = sub && sub.status ? String(sub.status) : "";
      const cancelAtPeriodEnd = sub && typeof sub.cancel_at_period_end !== "undefined" ? !!sub.cancel_at_period_end : null;

      const periodEndSec = sub && sub.current_period_end ? parseInt(String(sub.current_period_end), 10) : null;
      const periodEndIso = periodEndSec && Number.isFinite(periodEndSec) ? new Date(periodEndSec * 1000).toISOString() : null;

      console.log(nowIso(), "subscription event details", {
        type: event.type,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        stripe_status: status || null,
        cancel_at_period_end: cancelAtPeriodEnd,
        current_period_end: periodEndIso,
      });

      if (pool && customerId) {
        try {
          await pool.query(
            "update billing_subscriptions set " +
            "stripe_subscription_id = coalesce($2, stripe_subscription_id), " +
            "stripe_status = coalesce($3, stripe_status), " +
            "cancel_at_period_end = $4, " +
            "current_period_end = $5, " +
            "updated_at = now() " +
            "where stripe_customer_id = $1",
            [customerId, subscriptionId || null, status || null, cancelAtPeriodEnd, periodEndIso]
          );

          console.log(nowIso(), "Updated billing_subscriptions from subscription event", {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId || null,
            stripe_status: status || null,
            cancel_at_period_end: cancelAtPeriodEnd,
            current_period_end: periodEndIso,
          });
        } catch (e) {
          console.log(nowIso(), "Failed to update billing_subscriptions from subscription event:", e && e.message ? e.message : e);
        }
      } else {
        console.log(nowIso(), "subscription event missing customer id or DB not configured");
      }
    }

    if (event && event.type === "customer.subscription.deleted") {
      const sub = event.data && event.data.object ? event.data.object : null;

      const customerId = sub && sub.customer ? String(sub.customer) : "";
      const subscriptionId = sub && sub.id ? String(sub.id) : "";
      const status = sub && sub.status ? String(sub.status) : "";

      const periodEndSec = sub && sub.current_period_end ? parseInt(String(sub.current_period_end), 10) : null;
      const periodEndIso = periodEndSec && Number.isFinite(periodEndSec) ? new Date(periodEndSec * 1000).toISOString() : null;

      console.log(nowIso(), "customer.subscription.deleted details", {
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        stripe_status: status || null,
        current_period_end: periodEndIso,
      });

      if (pool && customerId) {
        try {
          const r = await pool.query(
            "select phone_e164 from billing_subscriptions where stripe_customer_id = $1 limit 1",
            [customerId]
          );

          const phone = r && r.rows && r.rows[0] && r.rows[0].phone_e164 ? String(r.rows[0].phone_e164) : "";

          if (phone) {
            try {
              await pool.query(
                "update callers set tier = 'free' where phone_e164 = $1",
                [phone]
              );

              console.log(nowIso(), "Downgraded caller tier due to subscription.deleted", {
                phone_e164: phone,
              });
            } catch (e) {
              console.log(nowIso(), "Failed to downgrade caller tier on subscription.deleted:", e && e.message ? e.message : e);
            }
          } else {
            console.log(nowIso(), "customer.subscription.deleted: could not find phone for customer", { stripe_customer_id: customerId });
          }

          try {
            await pool.query(
              "update billing_subscriptions set " +
              "stripe_subscription_id = coalesce($2, stripe_subscription_id), " +
              "stripe_status = $3, " +
              "cancel_at_period_end = $4, " +
              "current_period_end = $5, " +
              "updated_at = now() " +
              "where stripe_customer_id = $1",
              [customerId, subscriptionId || null, (status || "canceled"), false, periodEndIso]
            );

            console.log(nowIso(), "Updated billing_subscriptions on subscription.deleted", {
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId || null,
              stripe_status: (status || "canceled"),
              cancel_at_period_end: false,
              current_period_end: periodEndIso,
            });
          } catch (e) {
            console.log(nowIso(), "Failed to update billing_subscriptions on subscription.deleted:", e && e.message ? e.message : e);
          }

        } catch (e) {
          console.log(nowIso(), "customer.subscription.deleted handler DB error:", e && e.message ? e.message : e);
        }
      } else {
        console.log(nowIso(), "customer.subscription.deleted missing customer id or DB not configured");
      }
    }

    if (event && event.type === "invoice.payment_failed") {
      const inv = event.data && event.data.object ? event.data.object : null;

      const customerId = inv && inv.customer ? String(inv.customer) : "";
      const subscriptionId = inv && inv.subscription ? String(inv.subscription) : "";
      const status = inv && inv.status ? String(inv.status) : "";

      console.log(nowIso(), "invoice.payment_failed details", {
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        invoice_status: status || null,
      });

      if (pool && customerId) {
        try {
          const r = await pool.query(
            "select phone_e164 from billing_subscriptions where stripe_customer_id = $1 limit 1",
            [customerId]
          );

          const phone = r && r.rows && r.rows[0] && r.rows[0].phone_e164 ? String(r.rows[0].phone_e164) : "";

          if (phone) {
            try {
              await pool.query(
                "update callers set tier = 'free' where phone_e164 = $1",
                [phone]
              );

              console.log(nowIso(), "Downgraded caller tier due to payment_failed", {
                phone_e164: phone,
              });
            } catch (e) {
              console.log(nowIso(), "Failed to downgrade caller tier on payment_failed:", e && e.message ? e.message : e);
            }
          } else {
            console.log(nowIso(), "invoice.payment_failed: could not find phone for customer", { stripe_customer_id: customerId });
          }

          try {
            await pool.query(
              "update billing_subscriptions set " +
              "stripe_subscription_id = coalesce($2, stripe_subscription_id), " +
              "stripe_status = $3, " +
              "updated_at = now() " +
              "where stripe_customer_id = $1",
              [customerId, subscriptionId || null, "payment_failed"]
            );

            console.log(nowIso(), "Updated billing_subscriptions on payment_failed", {
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId || null,
              stripe_status: "payment_failed",
            });
          } catch (e) {
            console.log(nowIso(), "Failed to update billing_subscriptions on payment_failed:", e && e.message ? e.message : e);
          }

        } catch (e) {
          console.log(nowIso(), "invoice.payment_failed handler DB error:", e && e.message ? e.message : e);
        }
      } else {
        console.log(nowIso(), "invoice.payment_failed missing customer id or DB not configured");
      }
    }

    console.log(nowIso(), "stripe-webhook event received", {
      type: event.type,
      id: event.id,
    });

    res.status(200).json({ received: true });

  } catch (e) {
    console.log(nowIso(), "stripe-webhook signature verification failed:", e && e.message ? e.message : e);
    res.status(400).send("Webhook Error");
  }
});
app.get("/stripe-health", (req, res) => {
  if (!stripe) {
    res.status(500).json({ ok: false, error: "Stripe not configured" });
    return;
  }

  res.status(200).json({ ok: true });
});

app.get("/subscribe", (req, res) => {
  const html =
    "<!doctype html>" +
    "<html><head><meta charset='utf-8' />" +
    "<meta name='viewport' content='width=device-width, initial-scale=1' />" +
    "<title>CallReady Memberships</title>" +
    "<link rel='preconnect' href='https://fonts.googleapis.com' />" +
    "<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin />" +
    "<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' rel='stylesheet' />" +
    "<style>" +
    ":root{" +
    "--bg:#F6F8F9;" +
    "--card:#ffffff;" +
    "--text:#2F3A40;" +
    "--muted:#5a6a73;" +
    "--border:#e6eaee;" +
    "--primary:#3A6F8F;" +
    "}" +
    "body{font-family:Inter,Arial,Helvetica,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;}" +
    ".backLink{display:inline-block;margin-bottom:24px;font-size:14px;color:var(--primary);text-decoration:none;}" +
    ".backLink:hover{text-decoration:underline;}" +
    ".wrap{max-width:940px;margin:0 auto;}" +
    ".card{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.07);padding:22px;}" +
    ".brand{display:flex;align-items:center;gap:12px;margin-bottom:10px;}" +
    ".logo{max-height:48px;max-width:240px;object-fit:contain;}" +
    "h2{margin:8px 0 6px 0;font-size:22px;letter-spacing:-0.2px;}" +
    "p{margin:0 0 14px 0;line-height:1.45;color:var(--muted);}" +
    ".error{margin:12px 0;padding:12px 14px;border:1px solid #d8a3a3;background:#fff5f5;border-radius:12px;color:#7a1f1f;font-size:14px;line-height:1.35;}" +
    ".compare{display:grid;grid-template-columns:1fr;gap:12px;margin-top:16px;}" +
    "@media(min-width:820px){.compare{grid-template-columns:1fr 1fr 1fr;}}" +
    ".tierCard{border:1px solid #cfd6dc;border-radius:14px;padding:14px;background:#fff;}" +
    ".tierCardHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px;}" +
    ".tierName{font-weight:700;font-size:15px;line-height:1.2;margin:0;}" +
    ".tierPrice{font-weight:700;font-size:16px;line-height:1.2;color:var(--text);text-align:right;}" +
    ".tierPrice small{display:block;font-weight:600;font-size:12px;color:var(--muted);margin-top:3px;}" +
    ".tierNote{font-size:13px;color:var(--muted);line-height:1.4;margin:0 0 10px 0;}" +
    ".tierList{margin:0;padding-left:18px;font-size:13px;color:var(--muted);line-height:1.4;}" +
    ".tierSelectable{cursor:pointer;}" +
    ".tierSelectable:hover{border-color:var(--primary);}" +
    ".tierSelectable input{width:18px;height:18px;margin-top:1px;}" +
    ".tierSelectWrap{display:flex;align-items:center;gap:10px;}" +
    ".tierCardSelected{border-color:var(--primary);box-shadow:0 0 0 3px rgba(58,111,143,0.12);}" +
    ".divider{height:1px;background:var(--border);margin:18px 0;}" +
    "label{display:block;font-size:14px;margin:0 0 6px 0;color:var(--text);}" +
    "input[type='tel']{width:100%;padding:12px 12px;border:1px solid #cfd6dc;border-radius:12px;font-size:16px;}" +
    ".helper{margin-top:8px;font-size:12px;color:var(--muted);}" +
    ".actions{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;}" +
    "button{background:var(--primary);color:#fff;border:0;border-radius:14px;padding:12px 16px;font-size:16px;font-weight:600;cursor:pointer;}" +
    "button:hover{filter:brightness(0.95);}" +
    ".fine{margin-top:14px;font-size:12px;color:var(--muted);line-height:1.4;}" +
    "</style>" +
    "<script>" +
    "function crSyncTierSelection(){" +
    "  var member = document.getElementById('cr-tier-member');" +
    "  var power = document.getElementById('cr-tier-power');" +
    "  var memberCard = document.getElementById('cr-card-member');" +
    "  var powerCard = document.getElementById('cr-card-power');" +
    "  if (!member || !power || !memberCard || !powerCard) return;" +
    "  if (member.checked){memberCard.classList.add('tierCardSelected');} else {memberCard.classList.remove('tierCardSelected');}" +
    "  if (power.checked){powerCard.classList.add('tierCardSelected');} else {powerCard.classList.remove('tierCardSelected');}" +
    "}" +
    "document.addEventListener('DOMContentLoaded', function(){" +
    "  crSyncTierSelection();" +
    "  var radios = document.querySelectorAll(\"input[name='plan']\");" +
    "  for (var i=0;i<radios.length;i++){radios[i].addEventListener('change', crSyncTierSelection);}" +
    "});" +
    "</script>" +
    "</head><body>" +
    "<div class='wrap'>" +
    "<a href='https://callready.live' class='backLink'>← Back to CallReady</a>" +
    "<div class='card'>" +
    "<div class='brand'>" +
    "<img class='logo' src='https://cdn.builder.io/api/v1/assets/279137d3cf234c9bb6c4cf3f6b1c4939/logo2' alt='CallReady logo' />" +
    "</div>" +
    "<h2>CallReady Memberships</h2>" +
    "<p>You already have a free membership just by calling CallReady. Upgrade if you want more practice sessions each month.</p>" +

    ((req.query && String(req.query.error || "") === "phone")
      ? "<div class='error'>Please enter a valid U.S. phone number, for example: 555 555 5555.</div>"
      : "") +

    "<form method='POST' action='/create-checkout'>" +

    "<div class='compare'>" +

    "<div class='tierCard' id='cr-card-free'>" +
    "<div class='tierCardHead'>" +
    "<div class='tierName'>Free</div>" +
    "<div class='tierPrice'>$0<small>no signup</small></div>" +
    "</div>" +
    "<div class='tierNote'>Your free membership is created automatically when you call CallReady from your phone. It's a great way to try CallReady and get a little practice in right away.</div>" +
    "<ul class='tierList'>" +
    "<li>Up to 4 practice sessions per month</li>" +
    "<li>Sessions can last between 4 and 7 minutes</li>" +
    "</ul>" +
    "</div>" +

    "<label class='tierCard tierSelectable' id='cr-card-member' for='cr-tier-member'>" +
    "<div class='tierCardHead'>" +
    "<div class='tierSelectWrap'>" +
    "<input id='cr-tier-member' type='radio' name='plan' value='member' checked />" +
    "<div class='tierName'>Member</div>" +
    "</div>" +
    "<div class='tierPrice'>$15<small>per month</small></div>" +
    "</div>" +
    "<div class='tierNote'>Steady practice to build comfort and consistency, without rushing.</div>" +
    "<ul class='tierList'>" +
    "<li>Up to 12 practice sessions per month</li>" +
    "<li>Sessions can last between 8 and 12 minutes</li>" +
    "</ul>" +
    "</label>" +

    "<label class='tierCard tierSelectable' id='cr-card-power' for='cr-tier-power'>" +
    "<div class='tierCardHead'>" +
    "<div class='tierSelectWrap'>" +
    "<input id='cr-tier-power' type='radio' name='plan' value='power' />" +
    "<div class='tierName'>Member Plus</div>" +
    "</div>" +
    "<div class='tierPrice'>$30<small>per month</small></div>" +
    "</div>" +
    "<div class='tierNote'>For frequent practice or ongoing confidence building.</div>" +
    "<ul class='tierList'>" +
    "<li>Up to 30 practice sessions per month</li>" +
    "<li>Sessions can last between 8 and 12 minutes for lots of low-pressure practice when you need it</li>" +
    "</ul>" +
    "</label>" +

    "</div>" +

    "<div class='divider'></div>" +

    "<label for='phone'>Practice phone number - <b>MAKE SURE TO USE THE NUMBER YOU'LL BE CALLING FROM</b></label>" +
    "<input id='phone' type='tel' name='phone' placeholder='555 555 5555' pattern='^[0-9\\s\\-()]{10,15}$' required />" +
    "<div class='helper'>U.S. numbers only.</div>" +

    "<div class='actions'>" +
    "<button type='submit'>Continue to payment</button>" +
    "</div>" +
    "<div class='fine'>Cancel anytime. If you cancel at period end, access stays active until the period ends.</div>" +
    "</form>" +

    "</div></div>" +
    "</body></html>";

  res.status(200).send(html);
});

app.get("/subscribe/success", (req, res) => {
  const html =
    "<!doctype html>" +
    "<html><head><meta charset='utf-8' />" +
    "<meta name='viewport' content='width=device-width, initial-scale=1' />" +
    "<title>Subscription Successful</title>" +
    "<link rel='preconnect' href='https://fonts.googleapis.com' />" +
    "<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin />" +
    "<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' rel='stylesheet' />" +
    "<style>" +
    ":root{--bg:#F6F8F9;--card:#ffffff;--text:#2F3A40;--muted:#5a6a73;--border:#e6eaee;--primary:#3A6F8F;}" +
    "body{font-family:Inter,Arial,Helvetica,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;}" +
    ".wrap{max-width:720px;margin:0 auto;}" +
    ".card{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.07);padding:22px;}" +
    ".brand{display:flex;align-items:center;gap:12px;margin-bottom:10px;}" +
    ".logo{max-height:48px;max-width:240px;object-fit:contain;}" +
    "h2{margin:8px 0 8px 0;font-size:22px;}" +
    "p{margin:0 0 14px 0;line-height:1.45;color:var(--muted);}" +
    ".actions{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;}" +
    "a.btn{display:inline-block;text-decoration:none;background:var(--primary);color:#fff;border-radius:14px;padding:12px 16px;font-size:16px;font-weight:600;}" +
    "</style></head><body>" +
    "<div class='wrap'><div class='card'>" +
    "<div class='brand'><img class='logo' src='https://cdn.builder.io/api/v1/image/assets%2F279137d3cf234c9bb6c4cf3f6b1c4939%2Fcab85975882a4da19b5eaa18e422c537' alt='CallReady logo' /></div>" +
    "<h2>You're all set</h2>" +
    "<p>Your membership is active for the phone number you entered.</p>" +
    "<p>Next step, call the CallReady number from that phone to start practicing.</p>" +
    "<div class='actions'><a class='btn' href='/subscribe'>Back to memberships</a></div>" +
    "</div></div></body></html>";

  res.status(200).send(html);
});

app.get("/subscribe/cancel", (req, res) => {
  const html =
    "<!doctype html>" +
    "<html><head><meta charset='utf-8' />" +
    "<meta name='viewport' content='width=device-width, initial-scale=1' />" +
    "<title>Checkout Canceled</title>" +
    "<link rel='preconnect' href='https://fonts.googleapis.com' />" +
    "<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin />" +
    "<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' rel='stylesheet' />" +
    "<style>" +
    ":root{--bg:#F6F8F9;--card:#ffffff;--text:#2F3A40;--muted:#5a6a73;--border:#e6eaee;--primary:#3A6F8F;}" +
    "body{font-family:Inter,Arial,Helvetica,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:24px;}" +
    ".wrap{max-width:720px;margin:0 auto;}" +
    ".card{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,0.07);padding:22px;}" +
    ".brand{display:flex;align-items:center;gap:12px;margin-bottom:10px;}" +
    ".logo{max-height:48px;max-width:240px;object-fit:contain;}" +
    "h2{margin:8px 0 8px 0;font-size:22px;}" +
    "p{margin:0 0 14px 0;line-height:1.45;color:var(--muted);}" +
    ".actions{margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;}" +
    "a.btn{display:inline-block;text-decoration:none;background:var(--primary);color:#fff;border-radius:14px;padding:12px 16px;font-size:16px;font-weight:600;}" +
    "</style></head><body>" +
    "<div class='wrap'><div class='card'>" +
    "<div class='brand'><img class='logo' src='https://cdn.builder.io/api/v1/image/assets%2F279137d3cf234c9bb6c4cf3f6b1c4939%2Fcab85975882a4da19b5eaa18e422c537' alt='CallReady logo' /></div>" +
    "<h2>Checkout canceled</h2>" +
    "<p>No changes were made. You can still use the free membership anytime by calling CallReady.</p>" +
    "<div class='actions'><a class='btn' href='/subscribe'>Back to memberships</a></div>" +
    "</div></div></body></html>";

  res.status(200).send(html);
});

app.get("/voice", (req, res) => res.status(200).send("OK. Configure Twilio to POST here."));

app.post("/stream", (req, res) => {
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
    console.error("Error building /stream TwiML:", err);
    res.status(500).send("Error");
  }
});

app.post("/voice", async (req, res) => {
  if (String(process.env.CALLREADY_UNAVAILABLE || "") === "1") {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const vr = new VoiceResponse();

    vr.redirect({ method: "POST" }, "/unavailable");

    res.type("text/xml").send(vr.toString());
    return;
  }

  try {
    const forceUnavailable =
      req.query &&
      String(req.query.force_unavailable || "") === "1";

    if (forceUnavailable) {
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const vr = new VoiceResponse();

      vr.redirect({ method: "POST" }, "/unavailable");

      res.type("text/xml").send(vr.toString());
      return;
    }
    const callSid = req.body && req.body.CallSid ? String(req.body.CallSid) : "";
    const from = req.body && req.body.From ? String(req.body.From) : "";

    if (callSid) {
      await logCallStartToDb(callSid, from);
    }

    const tierDecision = await applyTierForIncomingCall(from, callSid);

    const VoiceResponse = twilio.twiml.VoiceResponse;
    const vr = new VoiceResponse();

    // TEMP TEST OVERRIDE: allow all calls regardless of tier
    const FORCE_ALLOW_FOR_TESTING = true;
    if (FORCE_ALLOW_FOR_TESTING) {
      tierDecision.allowed = true;
    }

    if (!tierDecision.allowed) {
      console.log(nowIso(), "Blocking call due to no remaining sessions", {
        from,
        callSid,
        tier: tierDecision.tier,
        sessions_used: tierDecision.cycle_sessions_used,
        sessions_cap: tierDecision.cycle_sessions_cap
      });


      if (callSid) {
        fireAndForgetCallEndLog(callSid, "no_sessions_remaining");
      }

      vr.say(TWILIO_NO_SESSIONS_LEFT);
      vr.hangup();
      res.type("text/xml").send(vr.toString());
      return;
    }

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

app.post("/debug/sim-start", async (req, res) => {
  try {
    const callSid = req.body && req.body.CallSid ? String(req.body.CallSid) : "CA_SIM_START";
    const from = req.body && req.body.From ? String(req.body.From) : "+15035550123";

    if (callSid) {
      await logCallStartToDb(callSid, from);
    }

    res.status(200).json({
      ok: true,
      message: "Simulated call start logged. This does not open a Twilio WebSocket. Use it to confirm DB + tier + boot behavior.",
      callSid: callSid,
      from: from
    });
  } catch (e) {
    console.log(nowIso(), "debug/sim-start error:", e && e.message ? e.message : e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.post("/debug/openai-realtime-check", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      res.status(500).json({ ok: false, error: "missing_OPENAI_API_KEY" });
      return;
    }

    const modelName = OPENAI_REALTIME_MODEL;
    const voiceName = OPENAI_VOICE;

    const url =
      "wss://api.openai.com/v1/realtime?model=" + encodeURIComponent(modelName);

    const ws = new WebSocket(url, {
      headers: {
        Authorization: "Bearer " + OPENAI_API_KEY,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    let responded = false;
    let outText = "";

    const timeoutId = setTimeout(() => {
      try {
        if (!responded) {
          responded = true;
          try { ws.close(); } catch { }
          res.status(504).json({ ok: false, error: "timeout_waiting_for_response" });
        }
      } catch { }
    }, 6000);

    function safeClose() {
      try { ws.close(); } catch { }
    }

    function extractTextFromResponseDone(msg) {
      let text = "";
      const response = msg && msg.response ? msg.response : null;
      if (!response) return text;

      const output = Array.isArray(response.output) ? response.output : [];
      for (let i = 0; i < output.length; i += 1) {
        const item = output[i];
        if (!item) continue;
        const content = Array.isArray(item.content) ? item.content : [];
        for (let j = 0; j < content.length; j += 1) {
          const c = content[j];
          if (!c) continue;
          if (typeof c.text === "string") text += c.text + "\n";
          if (typeof c.value === "string") text += c.value + "\n";
          if (typeof c.transcript === "string") text += c.transcript + "\n";
        }
        if (typeof item.text === "string") text += item.text + "\n";
        if (typeof item.transcript === "string") text += item.transcript + "\n";
      }

      if (typeof response.output_text === "string") text += response.output_text + "\n";
      return text;
    }

    ws.on("open", () => {
      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          voice: voiceName,
          modalities: ["text"],
          turn_detection: null,
          temperature: 0.7,
          instructions:
            "Output exactly one line and nothing else.\n" +
            "The line must be: OK_VOICE_MODEL: " + voiceName + " | " + modelName + "\n"
        }
      }));

      ws.send(JSON.stringify({
        type: "response.create",
        response: { modalities: ["text"] }
      }));
    });

    ws.on("message", (data) => {
      let msg = null;
      try { msg = JSON.parse(String(data)); } catch { msg = null; }
      if (!msg) return;

      if (msg.type === "response.done") {
        outText = extractTextFromResponseDone(msg).trim();

        if (!responded) {
          responded = true;
          clearTimeout(timeoutId);
          safeClose();

          res.status(200).json({
            ok: true,
            model: modelName,
            voice: voiceName,
            output: outText
          });
        }
      }

      if (msg.type === "error") {
        if (!responded) {
          responded = true;
          clearTimeout(timeoutId);
          safeClose();

          res.status(500).json({
            ok: false,
            error: "openai_error_event",
            detail: msg
          });
        }
      }
    });

    ws.on("close", () => {
      if (responded) return;
    });

    ws.on("error", (err) => {
      if (!responded) {
        responded = true;
        clearTimeout(timeoutId);

        res.status(500).json({
          ok: false,
          error: "openai_ws_error",
          message: err && err.message ? String(err.message) : "unknown"
        });
      }
    });

  } catch (e) {
    console.log(nowIso(), "debug/openai-realtime-check error:", e && e.message ? e.message : e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.post("/create-checkout", async (req, res) => {
  try {
    if (!stripe) {
      res.status(500).send("Stripe not configured.");
      return;
    }

    if (!STRIPE_PRICE_MEMBER) {
      res.status(500).send("Missing STRIPE_PRICE_MEMBER.");
      return;
    }

    if (!PUBLIC_BASE_URL) {
      res.status(500).send("Missing PUBLIC_BASE_URL.");
      return;
    }

    const phoneRaw = req.body && req.body.phone ? String(req.body.phone) : "";
    const trimmed = phoneRaw.trim();
    const digitsOnly = trimmed.replace(/\D/g, "");

    let phone = "";
    if (digitsOnly.length === 10) {
      phone = "+1" + digitsOnly;
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
      phone = "+" + digitsOnly;
    } else {
      phone = "";
    }

    if (!phone) {
      res.redirect(303, "/subscribe?error=phone");
      return;
    }

    const planRaw = req.body && req.body.plan ? String(req.body.plan) : "member";
    const plan = planRaw.trim().toLowerCase();

    let priceId = STRIPE_PRICE_MEMBER;
    if (plan === "power") {
      if (!STRIPE_PRICE_POWER) {
        res.status(500).send("Missing STRIPE_PRICE_POWER.");
        return;
      }
      priceId = STRIPE_PRICE_POWER;
    }

    const base = String(PUBLIC_BASE_URL).replace(/\/+$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: base + "/subscribe/success",
      cancel_url: base + "/subscribe/cancel",
      metadata: { practice_phone: phone, tier: plan },
    });

    if (!session || !session.url) {
      res.status(500).send("Could not create checkout session.");
      return;
    }

    res.redirect(303, session.url);


  } catch (e) {
    console.log(nowIso(), "create-checkout error:", e && e.message ? e.message : e);
    res.status(500).send("Checkout error.");
  }
});

// /end supports:
// - retry=1 for the retry prompt
// - skip_transition=1 to go straight to opt-in language (used when AI ends the call)
app.post("/unavailable", async (req, res) => {
  try {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const vr = new VoiceResponse();
    vr.say(TWILIO_SERVICE_UNAVAILABLE);
    vr.hangup();
    res.type("text/xml").send(vr.toString());
  } catch (err) {
    console.error("Error building /unavailable TwiML:", err);
    res.status(500).send("Error");
  }
});
app.post("/end", async (req, res) => {
  try {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const vr = new VoiceResponse();

    const retry = req.query && req.query.retry ? String(req.query.retry) : "0";
    const isRetry = retry === "1";

    const skipTransition =
      req.query && req.query.skip_transition ? String(req.query.skip_transition) === "1" : false;

    const from = req.body && req.body.From ? String(req.body.From) : "";
    const callSid = req.body && req.body.CallSid ? String(req.body.CallSid) : "";
    const hardEnd = req.query && String(req.query.hard_end || "") === "1";

    if (!isRetry && hardEnd) {
      vr.say(TWILIO_HARD_LIMIT_MESSAGE);
    }

    const isSoftEnd = !hardEnd && (req.query && String(req.query.soft_end || "") === "1");

    if (!isRetry && isSoftEnd) {
      vr.say(
        "Quick note, that last scenario took us just past the usual practice session time, so we're going to wrap things up here for this session. You can call back any time and keep practicing, though!"
      );
    }

    if (!isRetry) {
      const alreadyOptedIn = await isAlreadyOptedInByPhone(from);
      if (alreadyOptedIn) {
        console.log(nowIso(), "Skipping SMS opt-in prompt, caller already opted in", { from, callSid });

        if (callSid) {
          fireAndForgetCallEndLog(callSid, "completed_already_opted_in");
        }

        if (!skipTransition && !hardEnd) {
          vr.say(TWILIO_END_TRANSITION);
        }

        vr.say("We hope you found your practice session helpful. If you have feeback for us, please don't hesitate to email us at callready dot live at gmail dot com. We'd love to hear from you! Have a great day!");
        vr.hangup();
        res.type("text/xml").send(vr.toString());
        return;
      }
    }

    if (!isRetry && !skipTransition && !hardEnd) {
      vr.say(TWILIO_END_TRANSITION);
    }

    const gather = vr.gather({
      numDigits: 1,
      timeout: 7,
      action: "/gather-result",
      method: "POST",
    });

    if (isRetry) gather.say(GATHER_RETRY_PROMPT);
    else gather.say(TWILIO_OPTIN_PROMPT);

    if (!isRetry) {
      const retryUrl = skipTransition ? "/end?retry=1&skip_transition=1" : "/end?retry=1";
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
        console.log(nowIso(), "Saved SMS opt-in to DB", { callSid, from, digits, optedIn: pressed1 });
      } else {
        console.log(nowIso(), "DB not configured, skipping sms_optins insert");
      }
    } catch (e) {
      console.log(nowIso(), "DB insert failed for sms_optins:", e && e.message ? e.message : e);
    }

    try {
      if (pool && callSid) {
        await pool.query("update calls set opted_in_sms_during_call = $2 where call_sid = $1", [callSid, pressed1]);
        console.log(nowIso(), "Updated calls.opted_in_sms_during_call", { callSid, opted_in_sms_during_call: pressed1 });
      }
    } catch (e) {
      console.log(nowIso(), "DB update failed for calls.opted_in_sms_during_call:", e && e.message ? e.message : e);
    }

    try {
      if (pool && from) {
        await setCallerSmsOptInState(from, pressed1);
      }
    } catch { }

    if (pressed1) {
      try {
        const smsResult = await sendSms(from, OPTIN_CONFIRM_SMS, "optin_confirm");
        console.log(nowIso(), "Opt-in confirmation SMS result", {
          from: from,
          ok: !!(smsResult && smsResult.ok),
          sid: smsResult && smsResult.sid ? smsResult.sid : null,
          error: smsResult && smsResult.error ? smsResult.error : null
        });
      } catch (e) {
        console.log(nowIso(), "Opt-in confirmation SMS threw", e && e.message ? e.message : e);
      }

      vr.say(IN_CALL_CONFIRM_YES);
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
  console.log(nowIso(), "WS CONNECT /media", "version:", CALLREADY_VERSION);
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
  let openerNoAudioTimer = null;

  let turnDetectionEnabled = false;

  let waitingForFirstCallerSpeech = true;
  let sawSpeechStarted = false;

  let requireCallerSpeechBeforeNextAI = false;
  let lockedCallType = null; // "outgoing" or "incoming"
  let awaitingCallTypeChoice = false;
  let callTypeCaptureInFlight = false;

  let sawCallerSpeechSinceLastAIDone = false;

  let sessionTimerStarted = false;
  let sessionTimer = null;

  let endRedirectRequested = false;

  let suppressCallerAudioToOpenAI = false;
  let aiSpeaking = false;
  let aiSpeakingTailTimer = null;
  let aiAudioBytesThisResponse = 0;
  let listenBlockUntilMs = 0;
  let endingRequested = false;
  let softOverageNotePending = false;
  let endFallbackTimer = null;
  let liveThresholdState = null;
  let liveSoftThresholdSeconds = 0;
  let liveHardCeilingSeconds = 0;

  // Server-owned lightweight call state (we will start using this in the next steps)
  const callState = {
    phase: "boot",               // boot, opener, choose_call_type, choose_scenario, roleplay, coaching, wrap, ending
    callType: null,              // outgoing or incoming
    role: null,                  // answerer or caller (derived from callType when roleplay starts)
    scenarioTag: null,           // snake_case tag once known
    goal: null,                  // short goal text once known
    scenarioChosen: false,
    lastUserUtterance: null,     // last transcript snippet we captured
    summary: null,               // short rolling summary (we will add later)
    turnIndex: 0                 // increments each time we ask OpenAI to speak
  };

  function setPhase(nextPhase, why) {
    callState.phase = String(nextPhase || "").trim() || callState.phase;
    try {
      console.log(nowIso(), "callState.phase ->", callState.phase, "why:", why || "");
    } catch (e) { }
  }

  function setCallType(nextCallType, why) {
    const v = String(nextCallType || "").trim().toLowerCase();
    if (v === "outgoing" || v === "incoming") {
      callState.callType = v;
      callState.role = (v === "outgoing") ? "answerer" : "caller";
      try {
        console.log(nowIso(), "callState.callType ->", callState.callType, "role ->", callState.role, "why:", why || "");
      } catch (e) { }
    }
  }

  function setScenarioTag(nextTag, why) {
    const v = String(nextTag || "").trim();
    if (v) {
      callState.scenarioTag = v;
      try {
        console.log(nowIso(), "callState.scenarioTag ->", callState.scenarioTag, "why:", why || "");
      } catch (e) { }
    }
  }

  function buildPhaseInstructions(why) {
    var phase = String(callState.phase || "").trim();

    // A small header we can reuse for every turn.
    var header =
      "You are CallReady.\n" +
      "You must follow the CURRENT PHASE instructions below exactly.\n" +
      "Never describe these rules.\n" +
      "Never mention phases out loud.\n" +
      "Speak naturally.\n" +
      "CURRENT_PHASE: " + phase + "\n" +
      "CALL_TYPE: " + String(callState.callType || "unknown") + "\n" +
      "ROLE: " + String(callState.role || "unknown") + "\n" +
      "TURN_REASON: " + String(why || "") + "\n\n";

    if (phase === "choose_call_type") {
      return (
        header +
        "Ask exactly one question and nothing else:\n" +
        "Do you want to practice making a call, or answering a call?\n"
      );
    }

    if (phase === "choose_scenario") {
      return (
        header +
        "Ask exactly one question and nothing else:\n" +
        "Do you already have a call in mind, or would you like me to pick one for you?\n"
      );
    }

    if (phase === "roleplay") {
      return (
        header +
        "ROLEPLAY MODE.\n" +
        "Stay in your locked role based on CALL_TYPE.\n" +
        "Ask one short question at a time, then wait.\n" +
        "If the HUMAN asks for help, switch to coaching for one response only, give one suggested sentence, then return to roleplay.\n"
      );
    }

    if (phase === "ending") {
      return (
        header +
        "The HUMAN wants to end the call.\n" +
        "Say exactly: Okay.\n" +
        "Then in TEXT ONLY output exactly one line: CALLREADY_END: END_CALL_NOW\n"
      );
    }

    // Fallback for any phase we have not implemented yet.
    return (
      header +
      "If you are unsure what to do next, ask exactly one short question to clarify what the HUMAN wants to practice.\n"
    );
  }


  let lastCancelAtMs = 0;

  let priorContext = null;

  let scenarioTagAlreadyCaptured = false;
  let scenarioTagCaptureInFlight = false;
  let scenarioTagCaptureResolve = null;

  let callerRuntime = null;
  let perCallCapSeconds = FREE_PER_CALL_SECONDS;

  console.log(nowIso(), "Twilio WS connected", "version:", CALLREADY_VERSION);

  // Realtime usage logging for cost measurement
  const usageLog = {
    callSid: null,
    streamSid: null,
    openaiSessionId: null,
    startedAtMs: Date.now(),
    endedAtMs: null,
    endedReason: null,
    turns: 0,
    totals: {
      total_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      input_text_tokens: 0,
      input_audio_tokens: 0,
      output_text_tokens: 0,
      output_audio_tokens: 0
    }
  };
  let usageSummaryPersisted = false;

  function recordRealtimeServerEvent(msg) {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "session.created") {
      const sid = msg.session && msg.session.id ? String(msg.session.id) : null;
      usageLog.openaiSessionId = sid;
      console.log(JSON.stringify({
        kind: "cr_realtime_session_created",
        atIso: nowIso(),
        callSid: usageLog.callSid,
        streamSid: usageLog.streamSid,
        openaiSessionId: usageLog.openaiSessionId
      }));
      return;
    }

    if (msg.type === "response.done") {
      const usage = msg.response && msg.response.usage ? msg.response.usage : null;
      if (!usage) return;

      usageLog.turns += 1;

      usageLog.totals.total_tokens += usage.total_tokens || 0;
      usageLog.totals.input_tokens += usage.input_tokens || 0;
      usageLog.totals.output_tokens += usage.output_tokens || 0;

      const inDetails = usage.input_token_details || {};
      const outDetails = usage.output_token_details || {};

      usageLog.totals.input_text_tokens += inDetails.text_tokens || 0;
      usageLog.totals.input_audio_tokens += inDetails.audio_tokens || 0;

      usageLog.totals.output_text_tokens += outDetails.text_tokens || 0;
      usageLog.totals.output_audio_tokens += outDetails.audio_tokens || 0;

      console.log(JSON.stringify({
        kind: "cr_realtime_turn_usage",
        atIso: nowIso(),
        callSid: usageLog.callSid,
        streamSid: usageLog.streamSid,
        openaiSessionId: usageLog.openaiSessionId,
        responseId: msg.response && msg.response.id ? String(msg.response.id) : null,
        usage: usage
      }));
    }
  }

  function estimateRealtimeCostUSD(modelName, totals) {
    // Pricing reference:
    // https://openai.com/api/pricing/
    //
    // We estimate using non-cached token rates.
    // Audio tokens:
    // - gpt-realtime-mini and gpt-4o-mini-realtime-preview: in $10 / 1M, out $20 / 1M
    // - gpt-realtime: in $32 / 1M, out $64 / 1M
    // - gpt-4o-realtime-preview: in $40 / 1M, out $80 / 1M
    //
    // Text tokens:
    // - gpt-realtime-mini and gpt-4o-mini-realtime-preview: in $0.60 / 1M, out $2.40 / 1M
    // - gpt-realtime: in $4 / 1M, out $16 / 1M
    // - gpt-4o-realtime-preview: in $5 / 1M, out $20 / 1M

    const m = String(modelName || "").toLowerCase().trim();

    let inAudioPerM = 0;
    let outAudioPerM = 0;
    let inTextPerM = 0;
    let outTextPerM = 0;

    if (m === "gpt-4o-realtime-preview") {
      inAudioPerM = 40.0;
      outAudioPerM = 80.0;
      inTextPerM = 5.0;
      outTextPerM = 20.0;
    } else if (m === "gpt-realtime") {
      inAudioPerM = 32.0;
      outAudioPerM = 64.0;
      inTextPerM = 4.0;
      outTextPerM = 16.0;
    } else {
      // Default bucket covers:
      // - gpt-realtime-mini
      // - gpt-4o-mini-realtime-preview
      inAudioPerM = 10.0;
      outAudioPerM = 20.0;
      inTextPerM = 0.60;
      outTextPerM = 2.40;
    }

    const t = totals || {};

    const inAudioTokens = Number(t.input_audio_tokens || 0);
    const outAudioTokens = Number(t.output_audio_tokens || 0);
    const inTextTokens = Number(t.input_text_tokens || 0);
    const outTextTokens = Number(t.output_text_tokens || 0);

    const inAudio = (inAudioTokens / 1000000.0) * inAudioPerM;
    const outAudio = (outAudioTokens / 1000000.0) * outAudioPerM;
    const inText = (inTextTokens / 1000000.0) * inTextPerM;
    const outText = (outTextTokens / 1000000.0) * outTextPerM;

    return inAudio + outAudio + inText + outText;
  }

  function finalizeRealtimeUsageSummary(reason) {
    if (usageLog.endedAtMs) return null;

    usageLog.endedAtMs = Date.now();
    usageLog.endedReason = reason || "unknown";

    const durationSec = Math.max(1, Math.round((usageLog.endedAtMs - usageLog.startedAtMs) / 1000));
    const costEst = estimateRealtimeCostUSD(OPENAI_REALTIME_MODEL, usageLog.totals);

    const summary = {
      callSid: usageLog.callSid,
      streamSid: usageLog.streamSid,
      openaiSessionId: usageLog.openaiSessionId,
      model: OPENAI_REALTIME_MODEL,
      startedAtIso: new Date(usageLog.startedAtMs).toISOString(),
      endedAtIso: new Date(usageLog.endedAtMs).toISOString(),
      durationSec: durationSec,
      turns: usageLog.turns,
      totals: usageLog.totals,
      estimatedCostUSD: Number.isFinite(costEst) ? Number(costEst.toFixed(6)) : null,
      estimatedCostPerMinuteUSD: (Number.isFinite(costEst) && durationSec > 0) ? Number(((costEst * 60.0) / durationSec).toFixed(6)) : null,
      endedReason: usageLog.endedReason
    };

    console.log(JSON.stringify({
      kind: "cr_realtime_call_summary",
      atIso: nowIso(),
      summary: summary
    }));

    return summary;
  }
  function persistUsageSummaryOnce(reason) {
    if (usageSummaryPersisted) return null;

    const s = finalizeRealtimeUsageSummary(String(reason || "unknown"));
    if (!s) return null;

    usageSummaryPersisted = true;

    try {
      const sid = s.callSid || callSid || null;
      if (sid) {
        logAiUsageToDb(sid, s).catch(() => { });
      }
    } catch { }

    return s;
  }
  function persistUsageSummaryOnce(reason) {
    if (usageSummaryPersisted) return null;

    const s = finalizeRealtimeUsageSummary(String(reason || "unknown"));
    if (!s) return null;

    usageSummaryPersisted = true;

    try {
      const sid = s.callSid || callSid || null;
      if (sid) {
        logAiUsageToDb(sid, s).catch(() => { });
      }
    } catch { }

    return s;
  }

  function closeAll(reason) {
    if (closing) return;
    closing = true;
    console.log(nowIso(), "Closing:", reason);
    try {
      finalizeRealtimeUsageSummary(String(reason || "closeAll"));
    } catch { }


    try {
      if (sessionTimer) clearTimeout(sessionTimer);
    } catch { }

    try {
      if (liveThresholdState) clearLiveSessionThresholdTimers(liveThresholdState);
    } catch { }
    liveThresholdState = null;

    try {
      if (endFallbackTimer) clearTimeout(endFallbackTimer);
    } catch { }
    endFallbackTimer = null;


    try {
      if (aiSpeakingTailTimer) clearTimeout(aiSpeakingTailTimer);
    } catch { }

    try {
      if (openerRetryTimer) clearTimeout(openerRetryTimer);
    } catch { }

    try {
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    } catch { }
    try {
      if (twilioWs && twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    } catch { }
  }

  function closeOpenAIOnly(reason) {
    try {
      console.log(nowIso(), "Closing OpenAI only:", reason);
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    } catch { }
    openaiReady = false;
  }

  function twilioSend(obj) {
    if (twilioWs.readyState !== WebSocket.OPEN) return;
    twilioWs.send(JSON.stringify(obj));
  }

  function openaiSend(obj) {
    try {
      if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) return;

      // Global guard: only allow one active response.create at a time.
      // If one is active, queue the latest response.create and send it after response.done.
      if (obj && obj.type === "response.create") {
        if (callState.openaiResponseActive) {
          callState.pendingResponseCreate = obj;
          console.log(nowIso(), "Guard: queued response.create because a response is already active");
          return;
        }

        callState.openaiResponseActive = true;
        callState.pendingResponseCreate = null;
      }


      openaiWs.send(JSON.stringify(obj));
    } catch (e) {
      console.log(nowIso(), "openaiSend failed:", e && e.message ? e.message : e);
    }
  }

  function cancelOpenAIResponseIfAnyOnce(reason) {
    const now = Date.now();
    if (now - lastCancelAtMs < 500) return;
    lastCancelAtMs = now;
    try {
      console.log(nowIso(), "Cancelling response due to:", reason);
      openaiSend({ type: "response.cancel" });
    } catch { }
  }

  function formatMinutesApprox(seconds) {
    const s = typeof seconds === "number" && seconds >= 0 ? seconds : 0;
    const m = Math.max(0, Math.ceil(s / 60));
    return String(m);
  }

  function buildDynamicOpenerSpeech() {
    const base =
      "Hi, this is CallReady dot live. " +
      "We can practice a phone call together, no pressure. " +
      "If you want a quick prompt, just say help me. " +
      "When you're ready, we can start. ";

    if (!callerRuntime) {
      return base;
    }

    const totalCalls = callerRuntime.totalCalls || 1;
    const tier = String(callerRuntime.tier || "free");
    const remainingMinutes = formatMinutesApprox(callerRuntime.remainingSeconds);
    const capMinutes = formatMinutesApprox(perCallCapSeconds);

    if (totalCalls <= 1) {
      if (String(tier).toLowerCase() === "free") {
        return base + "It looks like this is your first time here, you're on the free membership connected to this number. ";
      }

      return (
        "Welcome to CallReady dot live, a place to practice phone calls until they feel familiar. " +
        "Your free membership is active for this number. " +
        "When you're ready, we can start."
      );
    }


    if (String(tier).toLowerCase() === "free") {
      return (
        "Welcome back to CallReady dot live, a place to practice phone calls until they feel familiar. " +
        "You have " +
        String(Math.max(0, (callerRuntime.cycle_sessions_cap || 0) - (callerRuntime.cycle_sessions_used || 0))) +
        " practice sessions left this month on the free membership. " +
        "If you want more sessions, you can check memberships at CallReady dot live. "
      );

    }

    return (
      "Welcome back to CallReady dot live, a place to practice phone calls until they feel familiar. " +
      "You have " +
      String(Math.max(0, (callerRuntime.cycle_sessions_cap || 0) - (callerRuntime.cycle_sessions_used || 0))) +
      " practice sessions left this month. "
    );

  }

  function buildRoleplayStartInstructions() {
    if (!callState.callType) {
      return "Ask one short question to clarify whether this is an incoming or outgoing call.";
    }

    if (callState.callType === "outgoing") {
      return (
        "We are now entering roleplay.\n" +
        "This is an OUTGOING call.\n" +
        "You are the ANSWERER.\n" +
        "Begin immediately with a realistic greeting as the person answering the phone.\n" +
        "After your greeting, ask one short, natural question.\n"
      );
    }

    if (callState.callType === "incoming") {
      return (
        "We are now entering roleplay.\n" +
        "This is an INCOMING call.\n" +
        "You are the CALLER.\n" +
        "First say exactly: Go ahead and say hello to start the call.\n" +
        "Then stop speaking completely and wait.\n"
      );
    }

    return "Begin roleplay naturally.";
  }

  function buildScenarioIntro() {
    if (!callState.scenarioTag) {
      return "We are practicing a phone call scenario.";
    }

    if (callState.scenarioTag === "doctor_appointment_scheduling") {
      return (
        "We are practicing this scenario:\n" +
        "Scheduling a doctor appointment.\n" +
        "Goal: schedule an appointment time."
      );
    }

    return "We are practicing a realistic phone call scenario.";
  }

  function sendOpenerOnce(label) {
    console.log(nowIso(), "Sending opener", label ? "(" + label + ")" : "");
    setPhase("opener", "sendOpenerOnce");
    const openerSpeech = buildDynamicOpenerSpeech();
    if (openerNoAudioTimer) {
      clearTimeout(openerNoAudioTimer);
    }
    openerNoAudioTimer = setTimeout(() => {
      console.log(nowIso(), "No opener audio received, redirecting to /unavailable");
      redirectCallToUnavailable("opener_no_audio");
    }, 3000);

    openaiSend({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: "Speak this exactly, naturally, then stop speaking:\n" + openerSpeech,
      },
    });
  }
  function sendScenarioStartOnce(label) {
    console.log(nowIso(), "Asking scenario start question", label ? "(" + label + ")" : "");
    setPhase("choose_call_type", "sendScenarioStartOnce");
    awaitingCallTypeChoice = true;
    lockedCallType = null;
    callTypeCaptureInFlight = false;

    openaiSend({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions:
          "Say nothing before the question.\n" +
          "Do not say okay, sure, of course, or any other lead-in.\n" +
          "Ask exactly one question and nothing else:\n" +
          "Do you want to practice making a call, or answering a call?",
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
        } catch { }
        armOpenerRetryTimer();
        return;
      }

      openerResent = true;
      console.log(nowIso(), "Opener audio did not arrive, resending opener once");
      sendOpenerOnce("retry");
    }, 1500);
  }

  function prepForEnding() {
    endingRequested = true;
    clearEndFallbackTimer();

    suppressCallerAudioToOpenAI = true;

    waitingForFirstCallerSpeech = false;
    sawSpeechStarted = true;
    requireCallerSpeechBeforeNextAI = false;
    sawCallerSpeechSinceLastAIDone = true;

    openaiSend({ type: "input_audio_buffer.clear" });
    openaiSend({ type: "session.update", session: { turn_detection: null } });
  }

  async function requestScenarioTagTextOnlyOnce(reason) {
    if (scenarioTagAlreadyCaptured) return;
    if (scenarioTagCaptureInFlight) return;
    if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) return;

    scenarioTagCaptureInFlight = true;

    console.log(nowIso(), "Requesting end-only scenario tag", reason);
    console.log(nowIso(), "Scenario tag capture state set true", { reason: reason, callSid: callSid || null });

    const p = new Promise((resolve) => {
      scenarioTagCaptureResolve = resolve;
      setTimeout(() => {
        if (scenarioTagCaptureResolve) {
          scenarioTagCaptureResolve();
          scenarioTagCaptureResolve = null;
        }
      }, 900);
    });

    openaiSend({
      type: "response.create",
      response: {
        modalities: ["text"],
        instructions:
          "Output exactly one line and nothing else.\n" +
          "The line must start with SCENARIO_TAG: followed by one short snake_case tag.\n" +
          "Example: SCENARIO_TAG: pharmacy_refill_outgoing\n" +
          "If you are unsure, output exactly: SCENARIO_TAG: unknown\n" +
          "Do not output JSON.\n" +
          "Do not include quotes.\n" +
          "Do not include any extra words before or after the line.",
      },
    });

    await p;
    scenarioTagCaptureInFlight = false;
  }

  function clearEndFallbackTimer() {
    try {
      if (endFallbackTimer) clearTimeout(endFallbackTimer);
    } catch { }
    endFallbackTimer = null;
  }

  async function hardHangupViaTwilio(reason) {
    if (!callSid) return;
    if (!hasTwilioRest()) return;

    try {
      const client = twilioClient();
      console.log(nowIso(), "Hard hangup via Twilio REST", callSid, "reason:", reason);
      await client.calls(callSid).update({ status: "completed" });
    } catch (e) {
      console.log(nowIso(), "Hard hangup failed:", e && e.message ? e.message : e);
    }
  }

  async function redirectToEndWithRetry(reason, opts) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await redirectCallToEnd(reason, opts);
        return true;
      } catch (e) {
        console.log(nowIso(), "Redirect to /end attempt failed", { attempt, reason });

        try {
          await new Promise((r) => setTimeout(r, 250 * attempt));
        } catch { }
      }
    }

    return false;
  }

  async function requestEnd(reason, opts) {
    if (endingRequested) return;
    endingRequested = true;

    console.log(nowIso(), "Ending requested:", reason);

    suppressCallerAudioToOpenAI = true;

    try {
      cancelOpenAIResponseIfAnyOnce("ending");
    } catch { }

    try {
      openaiSend({ type: "input_audio_buffer.clear" });
    } catch { }

    try {
      openaiSend({ type: "session.update", session: { turn_detection: null } });
    } catch { }

    clearEndFallbackTimer();
    endFallbackTimer = setTimeout(() => {
      (async () => {
        if (endRedirectRequested) return;

        console.log(nowIso(), "End fallback timer fired, forcing hangup");
        await hardHangupViaTwilio("end_fallback_timer");
        closeAll("End fallback hangup");
      })().catch(() => { });
    }, 4000);

    const ok = await redirectToEndWithRetry(reason, opts);

    if (!ok && !endRedirectRequested) {
      await hardHangupViaTwilio("redirect_failed");
      closeAll("Redirect failed, hung up");
    }
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
      console.log(nowIso(), "Cannot redirect to /end, missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN", reason);
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
      const softEnd = String(reason || "") === "soft_threshold_end";
      const hardEnd = String(reason || "") === "hard_ceiling_end";

      let extra = "";
      if (softEnd) extra = "&soft_end=1";
      if (hardEnd) extra = "&hard_end=1";

      const endUrl = skipTransition
        ? base + "/end?retry=0&skip_transition=1" + extra
        : base + "/end?retry=0" + extra;



      console.log(nowIso(), "Redirecting call to /end now", callSid, "reason:", reason, "skipTransition:", skipTransition);

      await client.calls(callSid).update({ url: endUrl, method: "POST" });

      console.log(nowIso(), "Redirected call to /end via Twilio REST", callSid);

      closeOpenAIOnly("Redirected to /end");
    } catch (err) {
      console.log(nowIso(), "Twilio REST redirect to /end error:", err && err.message ? err.message : err);
      closeAll("Redirect to /end failed");
    }
  }
  async function redirectCallToUnavailable(reason) {
    if (endRedirectRequested) return;
    endRedirectRequested = true;

    if (!callSid) {
      console.log(nowIso(), "Cannot redirect to /unavailable, missing callSid", reason);
      closeAll("Missing callSid for unavailable redirect");
      return;
    }

    if (!hasTwilioRest()) {
      console.log(nowIso(), "Cannot redirect to /unavailable, missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN", reason);
      closeAll("Missing Twilio REST creds for unavailable redirect");
      return;
    }

    if (!PUBLIC_BASE_URL) {
      console.log(nowIso(), "Cannot redirect to /unavailable, missing PUBLIC_BASE_URL", reason);
      closeAll("Missing PUBLIC_BASE_URL for unavailable redirect");
      return;
    }

    try {
      const client = twilioClient();
      const base = PUBLIC_BASE_URL.replace(/\/+$/, "");
      const url = base + "/unavailable";

      console.log(nowIso(), "Redirecting call to /unavailable now", callSid, "reason:", reason);

      await client.calls(callSid).update({ url: url, method: "POST" });

      console.log(nowIso(), "Redirected call to /unavailable via Twilio REST", callSid);

      closeOpenAIOnly("Redirected to /unavailable");

    } catch (err) {
      console.log(nowIso(), "Twilio REST redirect to /unavailable error:", err && err.message ? err.message : err);
      closeAll("Redirect to /unavailable failed");
    }
  }
  function maybeStartSessionTimer() {
    return;
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

    const v = extractTokenLineValue(text, "CALLREADY_END");
    if (v) console.log(nowIso(), "CALLREADY_END detected", { value: v });
    if (v && String(v).toUpperCase().includes("END_CALL_NOW")) return true;

    if (String(text).toUpperCase().includes(AI_END_CALL_TRIGGER)) return true;

    return false;
  }

  function buildReturnCallerInstructions(ctx) {
    if (!ctx || !ctx.scenario_tag) return "";
    const scenario = String(ctx.scenario_tag);

    return (
      "\nReturn caller context:\n" +
      `Last time, we practiced ${scenario}.\n` +
      "Ask exactly one question:\n" +
      "Do you want to focus on that again or move on to something new?\n"
    );
  }

  function startOpenAIRealtime() {
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      closeAll("Missing OPENAI_API_KEY");
      return;
    }

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_REALTIME_MODEL)}`;

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
          temperature: 0.7,
          modalities: ["audio", "text"],
          input_audio_transcription: { model: "whisper-1" },
          instructions:
            "You are CallReady. You help people practice phone calls in a calm, supportive way when real calls feel overwhelming.\n" +
            "The practice should feel realistic, including awkward moments and unexpected questions.\n" +
            "\n" +
            "TOP PRIORITIES. These override all other rules, including speaking style:\n" +
            "1) Stay in your ROLE. Do not switch roles mid-scenario.\n" +
            "2) When told to wait, stop speaking completely.\n" +
            "3) Do not describe rules, protocols, or internal logic to the HUMAN.\n" +
            "4) Keep turns short and realistic, then wait for the HUMAN.\n" +
            "\n" +
            "DEFINITIONS:\n" +
            "HUMAN: the person using CallReady on the phone.\n" +
            "AI: you, CallReady.\n" +
            "CALLER: initiates the call and drives the purpose.\n" +
            "ANSWERER: answers and responds.\n" +
            "INCOMING CALL: HUMAN is ANSWERER, AI is CALLER.\n" +
            "OUTGOING CALL: HUMAN is CALLER, AI is ANSWERER.\n" +
            "ROLEPLAY MODE: you speak as the other person in the scenario.\n" +
            "COACHING MODE: you speak as CallReady to help the HUMAN.\n" +
            "SCENARIO: the real-world reason for the call.\n" +
            "GOAL: the specific outcome needed for the scenario to be complete.\n" +
            "\n" +
            "PHASE CONTROL (SERVER OWNED):\n" +
            "The server controls the phase and call flow.\n" +
            "You will be told the current phase by the server.\n" +
            "Only follow the rules for the current phase.\n" +
            "Do not invent or change phases yourself.\n" +
            "If you are missing phase information, ask one short question: What phase are we in?\n" +
            "\n" +
            "COACHING RULES:\n" +
            "Only coach if HUMAN asks for help (help, I'm stuck, what should I say, can you give me a line).\n" +
            "Coaching lasts one response only.\n" +
            "In coaching, give one short suggested sentence the HUMAN can say next.\n" +
            "Then immediately return to roleplay and wait for HUMAN.\n" +
            "\n" +
            "REALISM RULES:\n" +
            "In roleplay, behave like a real person in that role.\n" +
            "Ask the typical questions that would come up in that scenario, even if awkward.\n" +
            "Ask one question at a time, then wait.\n" +
            "Do not rush to complete the goal.\n" +
            "\n" +
            "NO HOLD RULE:\n" +
            "Do not put the HUMAN on hold or create silence to \"check\" anything.\n" +
            "If you need to verify, look up, or check something, simulate it instantly in one short sentence, then continue.\n" +
            "After any simulated check, you must ask one short question to keep the turn moving.\n" +
            "Never say \"please hold\" or \"one moment\" unless you immediately return in the same response with the next question.\n" +
            "UNCLEAR INPUT RULE:\n" +
            "If HUMAN is unclear, unintelligible, or you suspect background noise is interfering, do not guess.\n" +
            "Say exactly one sentence:\n" +
            "I seem to be having a hard time hearing you. Can you make sure you are in a quiet space or speak up a bit?\n" +
            "Then wait for HUMAN to speak again.\n" +
            "\n" +
            "SPEAKING STYLE (lower priority than the top priorities):\n" +
            "Use short sentences. Use contractions. Keep it conversational.\n" +
            "Avoid sounding scripted. It is okay to sound slightly awkward.\n" +
            "Do not overuse filler. Do not say \"got it\" more than twice per scenario.\n" +
            "\n" +
            "PRIVACY:\n" +
            "If personal details are needed, tell HUMAN to use clearly fake details.\n" +
            "If details are unrealistic, accept them for practice and move on.\n" +
            "\n" +
            "WRAP UP RULE:\n" +
            "When the goal is clearly complete, stop roleplay and say exactly: That wraps up this practice call.\n" +
            "Then ask one short question: Do you want feedback?\n" +
            "If yes, give one sentence of praise and one sentence of what to try next time.\n" +
            "Then offer choices with one question: practice the same scenario again, practice a different scenario, or end the call.\n" +
            "\n" +
            "SUPPORT REDIRECTION:\n" +
            "If HUMAN asks about CallReady itself (pricing, membership, bugs, texts), reply with one short sentence directing them to callready dot live.\n" +
            "Then ask: Do you want to go back to practicing?\n" +
            "\n" +
            "ENDING RULE:\n" +
            "If HUMAN asks to end the call, quit, stop, or hang up, do both in the same response:\n" +
            "1) Say exactly: Okay.\n" +
            "2) In TEXT ONLY, output exactly one line: CALLREADY_END: END_CALL_NOW\n" +
            "Never say the token out loud.\n",
        },
      });

      if (!openerSent) {
        openerSent = true;
        openerAudioDeltaCount = 0;
        openerResent = false;

        setTimeout(() => {
          sendOpenerOnce("initial");
          armOpenerRetryTimer();
        }, 250);
      }
    });

    openaiWs.on("message", (data) => {
      const msg = safeJsonParse(data.toString());
      if (!msg) return;
      recordRealtimeServerEvent(msg);


      if (msg.type === "response.audio.delta" && msg.delta && streamSid) {
        if (openerNoAudioTimer) {
          clearTimeout(openerNoAudioTimer);
          openerNoAudioTimer = null;
        }
        const b = Buffer.from(msg.delta, "base64").length;
        aiAudioBytesThisResponse += b;

        // g711_ulaw is 8000 samples per second, 1 byte per sample
        const audioMs = Math.floor((aiAudioBytesThisResponse / 8000) * 1000);

        // Block listening until estimated playback end plus a small safety buffer
        listenBlockUntilMs = Date.now() + audioMs + 10;


        if (!turnDetectionEnabled && openerSent) {
          openerAudioDeltaCount += 1;
          if (openerAudioDeltaCount === 1) {
            console.log(nowIso(), "Opener: first audio delta forwarded to Twilio");
          }
        }

        if (turnDetectionEnabled && waitingForFirstCallerSpeech && !sawSpeechStarted) {
          cancelOpenAIResponseIfAnyOnce("AI spoke before first caller speech");
          return;
        }

        if (turnDetectionEnabled && requireCallerSpeechBeforeNextAI && !sawCallerSpeechSinceLastAIDone) {
          cancelOpenAIResponseIfAnyOnce("turn lock active");
          return;
        }

        if (!aiSpeaking) {
          aiSpeaking = true;
          try {
            if (aiSpeakingTailTimer) clearTimeout(aiSpeakingTailTimer);
          } catch { }
          aiSpeakingTailTimer = null;
        }

        twilioSend({ event: "media", streamSid, media: { payload: msg.delta } });
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
      if (msg.type === "input_audio_buffer.speech_stopped") {
        if (!turnDetectionEnabled) return;
        if (endingRequested || endRedirectRequested) return;

        // In roleplay phase, do not auto-trigger AI unless the caller actually spoke
        if (callState.phase === "roleplay" && !sawCallerSpeechSinceLastAIDone) {
          console.log(nowIso(), "Roleplay guard: ignoring speech_stopped because caller did not speak");
          return;
        }

        // Guard: do not create a new response while one is already active.
        // This prevents: conversation_already_has_active_response
        if (responseActive) {
          console.log(nowIso(), "Skipping speech_stopped response.create because a response is already active");
          return;
        }

        // Allow AI to respond after the caller finishes speaking
        requireCallerSpeechBeforeNextAI = false;
        sawCallerSpeechSinceLastAIDone = true;

        if (turnDetectionEnabled && awaitingCallTypeChoice && !lockedCallType && !callTypeCaptureInFlight) {
          callTypeCaptureInFlight = true;

          openaiSend({
            type: "response.create",
            response: {
              modalities: ["text"],
              instructions:
                "Output exactly one line and nothing else.\n" +
                "If the HUMAN chose making a call, output: CALL_TYPE: outgoing\n" +
                "If the HUMAN chose answering a call, output: CALL_TYPE: incoming\n" +
                "If unclear, output: CALL_TYPE: unknown\n",
            },
          });

          return;
        }

        if (turnDetectionEnabled && callState.phase === "choose_scenario" && !callState.scenarioChosen && !callState.scenarioCaptureInFlight) {
          callState.scenarioCaptureInFlight = true;

          openaiSend({
            type: "response.create",
            response: {
              modalities: ["text"],
              instructions:
                "Output exactly one line and nothing else.\n" +
                "If the HUMAN wants you to pick, output: SCENARIO_PICK: yes\n" +
                "If the HUMAN already has a call in mind, output: SCENARIO_PICK: no\n" +
                "If unclear, output: SCENARIO_PICK: unknown\n",
            },
          });

          return;
        }

        // Ask OpenAI to respond now, but ALWAYS include phase instructions.
        openaiSend({
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            instructions: buildPhaseInstructions("speech_stopped_auto_turn")
          },
        });

        return;
      }

      if (msg.type === "response.created") {
        responseActive = true;
        aiAudioBytesThisResponse = 0;


        if (turnDetectionEnabled) console.log(nowIso(), "OpenAI response.created (post-opener)");
        return;
      }

      if (msg.type === "response.done") {
        const text = extractTextFromResponseDone(msg);
        responseActive = false;
        callState.openaiResponseActive = false;
        if (callState.pendingResponseCreate) {
          const queued = callState.pendingResponseCreate;
          callState.pendingResponseCreate = null;
          console.log(nowIso(), "Guard: flushing queued response.create after response.done");
          openaiSend(queued);
        }

        if (turnDetectionEnabled) console.log(nowIso(), "OpenAI response.done (post-opener)");

        if (scenarioTagCaptureInFlight && !scenarioTagAlreadyCaptured && callSid) {
          const scenarioTag = extractTokenLineValue(text, "SCENARIO_TAG");
          console.log(nowIso(), "Scenario tag raw text (first 300 chars)", String(text || "").slice(0, 300));

          if (scenarioTag) {
            scenarioTagAlreadyCaptured = true;
            setScenarioTagOnce(callSid, scenarioTag);
          }

          if (scenarioTagCaptureResolve) {
            scenarioTagCaptureResolve();
            scenarioTagCaptureResolve = null;
          }
        }

        if (callTypeCaptureInFlight && awaitingCallTypeChoice) {
          const ct = extractTokenLineValue(text, "CALL_TYPE");
          const v = ct ? String(ct).trim().toLowerCase() : "";

          // Always clear the capture flag first so we can retry if needed.
          callTypeCaptureInFlight = false;

          // If the model couldn't determine it, ask the call type question again and stay in choose_call_type.
          if (v !== "outgoing" && v !== "incoming") {
            lockedCallType = null;
            awaitingCallTypeChoice = true;
            setPhase("choose_call_type", "call_type_unclear_retry");

            openaiSend({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  "Say nothing before the question.\n" +
                  "Do not say okay, sure, of course, or any other lead-in.\n" +
                  "Ask exactly one question and nothing else:\n" +
                  "Do you want to practice making a call, or answering a call?",
              },
            });

            return;
          }

          // Valid call type.
          if (!lockedCallType) lockedCallType = v;
          setCallType(v, "parsed_call_type");
          awaitingCallTypeChoice = false;

          openaiSend({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              instructions:
                "Say one short sentence confirming the call type in plain language.\n" +
                "Then ask exactly one question, using this wording:\n" +
                "Do you already have a call in mind, or would you like me to pick one for you?\n" +
                "Do not use the words scenario or goal.\n" +
                "Do not ask follow-up questions yet.\n",
            },
          });

          // Next phase is choosing the scenario (do not start roleplay yet)
          setPhase("choose_scenario", "after_call_type_confirm");
          callState.scenarioChosen = false;
          callState.turnIndex += 1;

          return;
        }

        if (callState.scenarioCaptureInFlight && callState.phase === "choose_scenario") {
          const pick = extractTokenLineValue(text, "SCENARIO_PICK");
          const v = pick ? String(pick).trim().toLowerCase() : "unknown";

          console.log(nowIso(), "Parsed SCENARIO_PICK", { value: v });

          callState.scenarioCaptureInFlight = false;

                    // If the model couldn't decide, ask again and stay in choose_scenario.
          if (v !== "yes" && v !== "no") {
            callState.scenarioCaptureInFlight = false;
            setPhase("choose_scenario", "scenario_pick_unclear_retry");

            openaiSend({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  "Ask exactly one question and nothing else:\n" +
                  "Do you already have a call in mind, or would you like me to pick one for you?",
              },
            });

            return;
          }

          if (v === "yes") {
            callState.scenarioChosen = true;

            // Pick a default, common scenario for now.
            setScenarioTag("doctor_appointment_scheduling", "default_pick");
            try {
              if (callSid) setScenarioTagOnce(callSid, "doctor_appointment_scheduling");
            } catch (e) { }

            setPhase("roleplay", "scenario_picked_default");

            openaiSend({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  buildScenarioIntro() + "\n\n" + buildRoleplayStartInstructions()

              }
            });

            return;
          }

                    if (v === "no") {
            callState.scenarioChosen = false;
            setPhase("choose_scenario", "scenario_user_has_one");

            openaiSend({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  "Ask exactly one question and nothing else:\n" +
                  "What kind of call do you want to practice?",
              },
            });

            return;
          }

          if (v === "no") {
            callState.scenarioChosen = false;

            openaiSend({
              type: "response.create",
              response: {
                modalities: ["audio", "text"],
                instructions:
                  "Ask exactly one question and nothing else:\n" +
                  "What kind of call do you want to practice?\n"
              }
            });

            return;
          }

          // If unclear, ask again.
          openaiSend({
            type: "response.create",
            response: {
              modalities: ["audio", "text"],
              instructions:
                "Ask exactly one question and nothing else:\n" +
                "Do you already have a call in mind, or would you like me to pick one for you?\n"
            }
          });

          return;
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
          } catch { }
          openerRetryTimer = null;

          openaiSend({ type: "input_audio_buffer.clear" });

          openaiSend({
            type: "session.update",
            session: {
              turn_detection: {
                type: "server_vad",
                silence_duration_ms: 1000,
                prefix_padding_ms: 500,
                threshold: 0.45,
                create_response: false,
                interrupt_response: false,
              },
            },
          });

          waitingForFirstCallerSpeech = false;
          sawSpeechStarted = true;
          requireCallerSpeechBeforeNextAI = false;
          sawCallerSpeechSinceLastAIDone = true;

          try {
            if (aiSpeakingTailTimer) clearTimeout(aiSpeakingTailTimer);
          } catch { }

          aiSpeakingTailTimer = setTimeout(() => {
            aiSpeaking = false;

            try {
              openaiSend({ type: "input_audio_buffer.clear" });
            } catch { }
          }, 50);


          sendScenarioStartOnce("post-opener");
          return;
        }

        if (turnDetectionEnabled) {
          // Detect natural scenario wrap-up and whether we crossed the soft threshold
          try {
            const wrapPhrase = "That wraps up this practice call.";
            const sawWrap = text && String(text).indexOf(wrapPhrase) !== -1;

            if (sawWrap && liveThresholdState && liveThresholdState.overSoftThresholdLive) {
              console.log(nowIso(), "Soft threshold reached at natural wrap-up, ending call", {
                callSid: callSid || null,
                softThresholdSeconds: liveSoftThresholdSeconds,
                hardCeilingSeconds: liveHardCeilingSeconds
              });

              (async () => {
                cancelOpenAIResponseIfAnyOnce("soft_threshold_end");
                await requestScenarioTagTextOnlyOnce("soft_threshold_end");
                await requestEnd("soft_threshold_end", { skipTransition: true });
              })().catch(() => { });
            }
          } catch { }

          const aiRequestedEnd = responseTextRequestsEnd(text);

          if (!endRedirectRequested && aiRequestedEnd) {
            (async () => {
              cancelOpenAIResponseIfAnyOnce("AI requested end");

              await requestScenarioTagTextOnlyOnce("ai_end");
              await requestEnd("AI requested end", { skipTransition: true });

            })().catch(() => { });
            return;
          }

          try {
            if (aiSpeakingTailTimer) clearTimeout(aiSpeakingTailTimer);
          } catch { }

          aiSpeakingTailTimer = setTimeout(() => {
            aiSpeaking = false;

            try {
              openaiSend({ type: "input_audio_buffer.clear" });
            } catch { }
          }, 50);


          // Default behavior: after AI speaks, allow the next AI response.
          // We only force a "caller must speak first" lock in specific situations
          // (e.g., incoming ring_wait), not after every response.
          requireCallerSpeechBeforeNextAI = false;
          sawCallerSpeechSinceLastAIDone = true;

          return;
        }
      }

      if (msg.type === "error") {
        const errObj = msg.error || msg;
        const code = errObj && typeof errObj.code === "string" ? errObj.code : null;

        if (code === "response_cancel_not_active") {
          console.log(nowIso(), "OpenAI non-fatal error (ignored):", errObj);
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

      if (closing) return;
      if (endingRequested) return;
      if (endRedirectRequested) return;

      redirectCallToUnavailable("openai_ws_closed");
    });


    openaiWs.on("error", (err) => {
      const msgText = err && err.message ? String(err.message) : "";
      if (msgText.includes("response_cancel_not_active")) {
        console.log(nowIso(), "OpenAI WS non-fatal error (ignored):", msgText);
        return;
      }

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
      usageLog.callSid = callSid || null;
      usageLog.streamSid = streamSid || null;
      usageLog.startedAtMs = Date.now();


      if (callSid) {
        priorContext = await fetchPriorCallContextByCallSid(callSid);
        if (priorContext) {
          console.log(nowIso(), "Loaded prior call context", priorContext);
        }

        callerRuntime = await fetchCallerRuntimeContextByCallSid(callSid);
        if (callerRuntime) {
          perCallCapSeconds =
            typeof callerRuntime.perCallCapSeconds === "number" && callerRuntime.perCallCapSeconds > 0
              ? callerRuntime.perCallCapSeconds
              : FREE_PER_CALL_SECONDS;

          console.log(nowIso(), "Loaded caller runtime", {
            tier: callerRuntime.tier,
            remainingSeconds: callerRuntime.remainingSeconds,
            perCallCapSeconds,
            totalCalls: callerRuntime.totalCalls,
            sms_opted_in: callerRuntime.sms_opted_in,
            cycle_anchor_at: callerRuntime.cycle_anchor_at,
            cycle_ends_at: callerRuntime.cycle_ends_at,
            cycle_seconds_used: callerRuntime.cycle_seconds_used,
          });
        }

        try {
          if (callerRuntime && callerRuntime.phone_e164) {
            const th = await getThresholdsForPhone(callerRuntime.phone_e164);

            liveSoftThresholdSeconds = th && Number(th.soft) > 0 ? Number(th.soft) : 240;
            liveHardCeilingSeconds = th && Number(th.hard) > 0 ? Number(th.hard) : 420;

            liveThresholdState = {
              callSid: callSid || null,
              overSoftThresholdLive: false,
              hitHardCeilingLive: false,
              softThresholdTimerId: null,
              hardCeilingTimerId: null,
            };

            startLiveSessionThresholdTimers({
              callState: liveThresholdState,
              softThresholdSeconds: liveSoftThresholdSeconds,
              hardCeilingSeconds: liveHardCeilingSeconds,
              onHardCeiling: function () {
                try {
                  if (endingRequested || endRedirectRequested) return;

                  console.log(nowIso(), "Hard ceiling reached, forcing end via /end", {
                    callSid: callSid || null,
                    hardCeilingSeconds: liveHardCeilingSeconds
                  });

                  (async () => {
                    cancelOpenAIResponseIfAnyOnce("hard_ceiling_end");
                    await requestScenarioTagTextOnlyOnce("hard_ceiling_end");
                    await requestEnd("hard_ceiling_end", { skipTransition: true });
                  })().catch(() => { });
                } catch { }
              }

            });

            console.log(nowIso(), "Live threshold timers armed (verification only)", {
              callSid: callSid || null,
              softThresholdSeconds: liveSoftThresholdSeconds,
              hardCeilingSeconds: liveHardCeilingSeconds
            });
          }
        } catch (e) {
          console.log(nowIso(), "Failed to start live threshold timers (non-fatal)", e && e.message ? e.message : e);
        }
      }

      startOpenAIRealtime();
      return;
    }

    if (msg.event === "media") {
      if (!turnDetectionEnabled) return;
      if (suppressCallerAudioToOpenAI) return;
      if (Date.now() < listenBlockUntilMs) return;

      if (aiSpeaking) {
        return;
      }

      if (openaiReady && msg.media && msg.media.payload) {

        openaiSend({
          type: "input_audio_buffer.append",
          audio: msg.media.payload,
        });
      }
      return;
    }

    if (msg.event === "stop") {
      console.log(nowIso(), "Twilio stream stop");
      try {
        persistUsageSummaryOnce("twilio_stop");
      } catch { }

      if (callSid) {
        const endedReason = endRedirectRequested ? "redirected_to_end" : "hangup_or_stream_stop";
        fireAndForgetCallEndLog(callSid, endedReason);
      }

      clearEndFallbackTimer();


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
  console.log(nowIso(), "POST /voice, POST /stream, WS /media");

});


