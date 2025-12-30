"use strict";

const express = require("express");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

// In-memory sessions keyed by CallSid
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

function ssml(text) {
  return `<speak>${text}</speak>`;
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

const CRISIS_MESSAGE = ssml(
  "It sounds like you might be dealing with thoughts of self harm." +
  '<break time="300ms"/>' +
  "I am really sorry you are going through that." +
  '<break time="300ms"/>' +
  "If you are in immediate danger, call 911 right now." +
  '<break time="300ms"/>' +
  "If you are in the United States, you can call or text 988 for the Suicide and Crisis Lifeline." +
  '<break time="300ms"/>' +
  "I am going to end this practice call now."
);

const OPENING = ssml(
  "Welcome to CallReady." +
  '<break time="300ms"/>' +
  "A safe place to practice real phone calls before they matter." +
  '<break time="400ms"/>' +
  "Just so you know," +
  '<break time="200ms"/>' +
  "this is a beta release," +
  '<break time="200ms"/>' +
  "so you might notice an occasional glitch." +
  '<break time="400ms"/>' +
  "Do you want to choose a type of call to practice," +
  '<break time="200ms"/>' +
  "like calling a doctor’s office to schedule an appointment," +
  '<break time="300ms"/>' +
  "or would you like me to pick an easy scenario to start?"
);

const WRAP_UP = ssml(
  "That is time for today." +
  '<break time="300ms"/>' +
  "Nice work sticking with it." +
  '<break time="300ms"/>' +
  "You can call back any time to practice again," +
  '<break time="200ms"/>' +
  "or visit callready dot live to learn more." +
  '<break time="300ms"/>' +
  "Goodbye."
);

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

function twimlSpeakAndGather(ssmlText, reprompt) {
  const rep = escapeXml(reprompt || "Go ahead, I am listening.");

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    '<Say voice="Polly.Salli">' + ssmlText + "</Say>" +
    '<Gather input="speech dtmf" action="/gather" method="POST" timeout="6" speechTimeout="auto">' +
    '<Say voice="Polly.Salli">' +
    ssml(
      "Take your time." +
      '<break time="200ms"/>' +
      rep
    ) +
    "</Say>" +
    "</Gather>" +
    '<Say voice="Polly.Salli">' +
    ssml(
      "I did not catch anything." +
      '<break time="200ms"/>' +
      "If you want help, say help me." +
      '<break time="200ms"/>' +
      "Or say choose for me."
    ) +
    "</Say>" +
    '<Redirect method="POST">/gather</Redirect>' +
    "</Response>"
  );
}

function twimlSayHangup(ssmlText) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    '<Say voice="Polly.Salli">' + ssmlText + "</Say>" +
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
        ssml(
          "No worries." +
          '<break time="200ms"/>' +
          "If you want," +
          '<break time="150ms"/>' +
          "say help me for examples," +
          '<break time="200ms"/>' +
          "or tell me what kind of call you want to practice."
        )
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
        ssml(
          "I cannot help with anything sexual or inappropriate." +
          '<break time="300ms"/>' +
          "Let us stick to everyday phone calls." +
          '<break time="300ms"/>' +
          "Do you want to choose a scenario," +
          '<break time="200ms"/>' +
          "or should I pick one?"
        )
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

    const start = ssml(
      "Great." +
      '<break time="300ms"/>' +
      "Ring ring." +
      '<break time="300ms"/>' +
      "Hello, thanks for calling." +
      '<break time="200ms"/>' +
      "How can I help you today?" +
      '<break time="400ms"/>' +
      "For practice," +
      '<break time="150ms"/>' +
      "we are doing " + escapeXml(sess.scenario) + "." +
      '<break time="300ms"/>' +
      "Go ahead."
    );

    res.type("text/xml").send(twimlSpeakAndGather(start));
    return;
  }

  if (lower.includes("help me") || lower.includes("what should i say")) {
    res.type("text/xml").send(
      twimlSpeakAndGather(
        ssml(
          "That is totally okay." +
          '<break time="300ms"/>' +
          "Here are two options you can try." +
          '<break time="300ms"/>' +
          "Option one." +
          '<break time="150ms"/>' +
          "Hi, I would like to schedule an appointment." +
          '<break time="300ms"/>' +
          "Option two." +
          '<break time="150ms"/>' +
          "Hi, I have a quick question." +
          '<break time="300ms"/>' +
          "Pick one and say it out loud."
        )
      )
    );
    return;
  }

  sess.turns += 1;

  let reply = "";

  if (sess.turns === 1) {
    reply = ssml(
      "Okay, thanks." +
      '<break time="200ms"/>' +
      "Just so you know," +
      '<break time="150ms"/>' +
      "if I ask for details like your name or date of birth," +
      '<break time="200ms"/>' +
      "you can make something up for practice." +
      '<break time="300ms"/>' +
      "What day were you hoping for?"
    );
  } else if (sess.turns === 2) {
    reply = ssml(
      "Got it." +
      '<break time="200ms"/>' +
      "And what time of day works best," +
      '<break time="150ms"/>' +
      "morning or afternoon?"
    );
  } else if (sess.turns === 3) {
    reply = ssml(
      "Perfect." +
      '<break time="200ms"/>' +
      "And what is the reason for the appointment?" +
      '<break time="200ms"/>' +
      "You can keep it general."
    );
  } else if (sess.turns === 4) {
    reply = ssml(
      "Thanks." +
      '<break time="300ms"/>' +
      "Before we wrap up," +
      '<break time="200ms"/>' +
      "how did that feel for you," +
      '<break time="150ms"/>' +
      "on a scale of one to five?"
    );
  } else {
    reply = ssml(
      "Nice work." +
      '<break time="300ms"/>' +
      "You stayed clear and polite through the call." +
      '<break time="300ms"/>' +
      "One small improvement is to slow down your first sentence just a bit." +
      '<break time="400ms"/>' +
      "Do you want to try again," +
      '<break time="200ms"/>' +
      "or practice a different scenario?"
    );

    sess.state = "choose";
    sess.scenario = null;
    sess.turns = 0;
  }

  res.type("text/xml").send(twimlSpeakAndGather(reply));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("CallReady stable server listening on port " + PORT);
});
