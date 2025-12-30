"use strict";

const express = require("express");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Keep sessions in memory keyed by CallSid.
// This resets if your server restarts, but it is stable for MVP.
const sessions = new Map();

function nowMs() {
  return Date.now();
}

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, {
      startedAt: nowMs(),
      scenario: null,
      state: "start",
      turns: 0
    });
  }
  return sessions.get(callSid);
}

function isTimeUp(sess) {
  return nowMs() - sess.startedAt >= 5 * 60 * 1000;
}

function hasSelfHarmSignals(text) {
  const t = (text || "").toLowerCase();
  const signals = [
    "kill myself",
    "killing myself",
    "end my life",
    "suicide",
    "suicidal",
    "want to die",
    "wanna die",
    "harm myself",
    "hurt myself",
    "self harm",
    "self-harm",
    "cut myself",
    "cutting myself",
    "overdose",
    "take my life",
    "no reason to live"
  ];
  return signals.some((s) => t.includes(s));
}

function hasSexualContent(text) {
  const t = (text || "").toLowerCase();
  const signals = [
    "sex",
    "sext",
    "nude",
    "nudes",
    "porn",
    "hook up",
    "hookup",
    "blowjob",
    "handjob",
    "oral",
    "rape"
  ];
  return signals.some((s) => t.includes(s));
}

const CRISIS_MESSAGE =
  "It sounds like you might be dealing with thoughts of self harm. I am really sorry you are going through that. " +
  "If you are in immediate danger, call 911 right now. If you are in the United States, you can call or text 988 for the Suicide and Crisis Lifeline. " +
  "If you are outside the United States, contact your local emergency number or a trusted person right away. " +
  "If you can, tell a trusted adult or someone near you what is going on. I am going to end this practice call now.";

const OPENING =
  "Welcome to CallReady. A safe place to practice real phone calls before they matter. " +
  "Quick note, this is a beta release, so you might notice an occasional glitch. " +
  "Do you want to choose a type of call to practice, like calling a doctor's office to schedule an appointment, " +
  "or would you like me to pick an easy scenario to start?";

const WRAP_UP =
  "That is time for today. Nice work sticking with it. " +
  "Call back any time to practice again, or visit callready dot live to learn more. Goodbye.";

function pickScenario() {
  const scenarios = [
    "calling a doctor's office to schedule a routine appointment",
    "calling a pizza place to place an order for pickup",
    "calling a school office to ask a quick question about a deadline",
    "calling a hair salon to ask about available appointment times",
    "calling a store to ask if an item is in stock"
  ];
  return scenarios[Math.floor(Math.random() * scenarios.length)];
}

function twimlSpeakAndGather(text, reprompt) {
  const sayText = escapeXml(text);
  const rep = escapeXml(reprompt || "Go ahead, I am listening.");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    '<Say voice="alice">' + sayText + "</Say>" +
    '<Gather input="speech dtmf" action="/gather" method="POST" timeout="6" speechTimeout="auto">' +
    '<Say voice="alice">' + rep + "</Say>" +
    "</Gather>" +
    '<Say voice="alice">' +
    escapeXml("I did not catch anything. If you want help, say help me. Or say choose for me.") +
    "</Say>" +
    "<Redirect method=\"POST\">/gather</Redirect>" +
    "</Response>"
  );
}

function twimlSayHangup(text) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    '<Say voice="alice">' + escapeXml(text) + "</Say>" +
    "<Hangup/>" +
    "</Response>"
  );
}

app.get("/", (req, res) => {
  res.type("text/plain").send("CallReady stable voice server is running.");
});

app.post("/voice", (req, res) => {
  const callSid = req.body.CallSid || "unknown";
  const sess = getSession(callSid);

  sess.startedAt = nowMs();
  sess.scenario = null;
  sess.state = "choose";
  sess.turns = 0;

  res.type("text/xml").send(twimlSpeakAndGather(OPENING));
});

app.post("/gather", (req, res) => {
  const callSid = req.body.CallSid || "unknown";
  const sess = getSession(callSid);

  const speech = (req.body.SpeechResult || "").trim();
  const digits = (req.body.Digits || "").trim();
  const userText = speech || digits || "";

  if (isTimeUp(sess)) {
    res.type("text/xml").send(twimlSayHangup(WRAP_UP));
    return;
  }

  if (!userText) {
    res.type("text/xml").send(
      twimlSpeakAndGather(
        "No worries. If you want, say help me for examples. Or tell me what kind of call you want to practice.",
        "I am listening."
      )
    );
    return;
  }

  if (hasSelfHarmSignals(userText)) {
    res.type("text/xml").send(twimlSayHangup(CRISIS_MESSAGE));
    return;
  }

  if (hasSexualContent(userText)) {
    res.type("text/xml").send(
      twimlSpeakAndGather(
        "I cannot help with anything sexual or inappropriate. Let us stick to everyday phone calls like appointments, ordering food, or calling a store. Do you want to choose a scenario, or should I pick one?",
        "Go ahead."
      )
    );
    return;
  }

  const lower = userText.toLowerCase();

  if (sess.state === "choose") {
    if (lower.includes("choose for me") || lower.includes("you choose") || lower.includes("pick for me")) {
      sess.scenario = pickScenario();
    } else {
      sess.scenario = userText;
    }

    sess.state = "practice";
    sess.turns = 0;

    const start =
      "Great. Ring ring. Hello, thanks for calling. How can I help you today? " +
      "For practice, we are doing " + sess.scenario + ". Go ahead.";

    res.type("text/xml").send(twimlSpeakAndGather(start));
    return;
  }

  if (lower.includes("help me") || lower.includes("what should i say")) {
    res.type("text/xml").send(
      twimlSpeakAndGather(
        "Totally okay. Here are two options you can try. Option one: Hi, I would like to schedule an appointment. Option two: Hi, I have a quick question. Pick one and say it out loud.",
        "Try one of those options."
      )
    );
    return;
  }

  // Practice logic: stable, scripted, one question at a time.
  // This is intentionally simple and predictable.
  sess.turns += 1;

  let reply = "";

  if (sess.turns === 1) {
    reply =
      "Okay, thanks. Just so you know, if I ask for details like your name or date of birth, you can make something up for practice. " +
      "What day were you hoping for?";
  } else if (sess.turns === 2) {
    reply =
      "Got it. And what time of day works best, morning or afternoon?";
  } else if (sess.turns === 3) {
    reply =
      "Perfect. And what is the reason for the appointment? You can keep it general, and you can make up details if you want.";
  } else if (sess.turns === 4) {
    reply =
      "Thanks. Let me repeat that back quickly. " +
      "Now, before we wrap up, how did that feel for you on a scale of one to five?";
  } else {
    reply =
      "Nice work. You kept it clear and polite, and you stayed in the conversation. " +
      "One small improvement is to speak a little slower on your first sentence. " +
      "Do you want to try again, or practice a different scenario?";
    sess.state = "choose";
    sess.scenario = null;
    sess.turns = 0;
  }

  res.type("text/xml").send(twimlSpeakAndGather(reply));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("CallReady stable server listening on port " + PORT);
});
