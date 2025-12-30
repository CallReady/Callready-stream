const express = require("express");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const app = express();
app.use(express.urlencoded({ extended: false }));

// In memory call state for v1
// callSid -> { startedAtMs, messages: [{role, content}], scenarioLocked }
const calls = new Map();

const TTS_VOICE = "Polly.Matthew";

function xmlEscape(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function nowMs() {
  return Date.now();
}

function isLikelyChooseForMe(text) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("you choose") ||
    t.includes("you pick") ||
    t.includes("surprise") ||
    t.includes("any") ||
    t.includes("doesn't matter") ||
    t.trim() === "choose" ||
    t.trim() === "pick"
  );
}

function looksLikeScenarioRequest(text) {
  const t = (text || "").toLowerCase();
  const keywords = [
    "doctor",
    "appointment",
    "clinic",
    "dentist",
    "school",
    "office",
    "teacher",
    "job",
    "interview",
    "manager",
    "pizza",
    "restaurant",
    "order",
    "bank",
    "pharmacy",
    "refill",
    "haircut",
    "salon",
    "hotel",
    "reservation"
  ];
  return keywords.some((k) => t.includes(k));
}

function systemPrompt() {
  return (
    "You are CallReady, a supportive phone call practice partner for teens and young adults. " +
    "Language lock: speak only in American English. Never switch languages. " +

    "Sound natural and human. Use short sentences and simple words. Avoid formal or corporate tone. " +
    "Keep each turn brief, usually 1 to 2 sentences. Do not give long explanations. " +
    "Use occasional small fillers sparingly, like 'okay', 'got it', 'sure', or 'alright'. " +
    "Do not overuse fillers. " +

    "Turn taking: ask exactly one question per turn, then stop. Do not ask multiple questions at once. " +
    "If you need two pieces of info, ask one now and the other later. " +

    "If the caller is quiet or unsure, be supportive. Offer two example phrases they can say, then ask one question. " +

    "Privacy: never ask for real personal information unless you also say they can make it up for practice. " +
    "Content boundaries: never discuss sexual or inappropriate topics for teens. " +
    "Self harm safety: if the caller expresses thoughts of self harm, stop roleplay and encourage immediate help, include 988 in the US, and suggest talking to a trusted adult. " +

    "Scenario handling: if the caller requests a specific scenario, do it. If they ask you to choose, pick an easy, realistic scenario. " +
    "When a scenario begins, start with 'Ring ring' and then answer like the other person on the line. " +

    "End condition: when the scenario goal is completed, transition into a wrap up. " +
    "Wrap up must be short: one sentence of positive feedback, one gentle tip, then ask if they want to try again or a different scenario. " +
    "Do not keep asking questions once the scenario is complete."
  );
}

async function openaiChat(messages) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: messages.map((m) => ({
        role: m.role,
        content: [{ type: "input_text", text: m.content }]
      }))
    })
  });

  const data = await res.json();

  let text = "";
  try {
    const out = data.output || [];
    for (const item of out) {
      const content = item.content || [];
      for (const c of content) {
        if (c.type === "output_text" && c.text) text += c.text;
      }
    }
  } catch {
    text = "";
  }

  if (!text) {
    text =
      "Sorry, I hit a little glitch. Want to try that again? What kind of call do you want to practice?";
  }

  return text.trim();
}

function twimlSayGather({ sayText, actionUrl, gatherTimeoutSeconds = 6 }) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    "<Say voice=\"" +
    xmlEscape(TTS_VOICE) +
    "\">" +
    xmlEscape(sayText) +
    "</Say>" +
    "<Gather input=\"speech\" action=\"" +
    xmlEscape(actionUrl) +
    "\" method=\"POST\" speechTimeout=\"auto\" timeout=\"" +
    String(gatherTimeoutSeconds) +
    "\" />" +
    "<Say voice=\"" +
    xmlEscape(TTS_VOICE) +
    "\">No rush. If you want help, you can say, help me.</Say>" +
    "<Gather input=\"speech\" action=\"" +
    xmlEscape(actionUrl) +
    "\" method=\"POST\" speechTimeout=\"auto\" timeout=\"" +
    String(gatherTimeoutSeconds) +
    "\" />" +
    "<Say voice=\"" +
    xmlEscape(TTS_VOICE) +
    "\">Okay. Feel free to call back when you are ready.</Say>" +
    "<Hangup/>" +
    "</Response>"
  );
}

function twimlSayHangup(sayText) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<Response>" +
    "<Say voice=\"" +
    xmlEscape(TTS_VOICE) +
    "\">" +
    xmlEscape(sayText) +
    "</Say>" +
    "<Hangup/>" +
    "</Response>"
  );
}

app.get("/", (req, res) => {
  res.type("text/plain").send("CallReady Gather server is running.");
});

app.post("/voice", (req, res) => {
  const callSid = req.body.CallSid || "unknown";
  const startedAtMs = nowMs();

  const opening =
    "Welcome to CallReady, a safe place to practice real phone calls before they matter. " +
    "Quick note, this is a beta release, so you might notice an occasional glitch. " +
    "I am an AI agent and this is practice, so there is no reason to feel self conscious. " +
    "Do you want to choose a type of call to practice, or would you like me to pick an easy one for you?";

  const messages = [
    { role: "system", content: systemPrompt() },
    { role: "assistant", content: opening }
  ];

  calls.set(callSid, {
    startedAtMs,
    messages,
    scenarioLocked: false
  });

  const baseUrl = (process.env.PUBLIC_BASE_URL || "").trim();
  const actionUrl = baseUrl ? baseUrl + "/turn" : "/turn";

  res.type("text/xml").send(
    twimlSayGather({
      sayText: opening,
      actionUrl
    })
  );
});

app.post("/turn", async (req, res) => {
  const callSid = req.body.CallSid || "unknown";
  const speech = (req.body.SpeechResult || "").trim();

  let state = calls.get(callSid);
  if (!state) {
    const baseUrl = (process.env.PUBLIC_BASE_URL || "").trim();
    const actionUrl = baseUrl ? baseUrl + "/turn" : "/turn";
    const restart =
      "Sorry, I lost the thread for a second. Do you want to choose a call scenario, or should I pick one?";
    calls.set(callSid, {
      startedAtMs: nowMs(),
      messages: [{ role: "system", content: systemPrompt() }, { role: "assistant", content: restart }],
      scenarioLocked: false
    });
    res.type("text/xml").send(twimlSayGather({ sayText: restart, actionUrl }));
    return;
  }

  const elapsedMs = nowMs() - state.startedAtMs;
  if (elapsedMs >= 5 * 60 * 1000) {
    const wrap =
      "Time is up for this practice session. You did a nice job sticking with it. " +
      "One small tip for next time is to say your purpose in one clear sentence. " +
      "Feel free to call again, or visit callready.live for unlimited use, texts with feedback after sessions, and remembering where you left off.";
    res.type("text/xml").send(twimlSayHangup(wrap));
    calls.delete(callSid);
    return;
  }

  const baseUrl = (process.env.PUBLIC_BASE_URL || "").trim();
  const actionUrl = baseUrl ? baseUrl + "/turn" : "/turn";

  // Silence or no speech captured
  if (!speech) {
    const nudge =
      "No rush. Want a little help thinking of what to say? " +
      "You can say, you choose, or tell me a type of call, like doctor, job interview, or ordering food. " +
      "What do you want to practice?";
    state.messages.push({ role: "assistant", content: nudge });
    res.type("text/xml").send(twimlSayGather({ sayText: nudge, actionUrl }));
    return;
  }

  // Add user message
  state.messages.push({ role: "user", content: speech });

  // Scenario selection phase
  if (!state.scenarioLocked) {
    const lower = speech.toLowerCase();

    if (
      isLikelyChooseForMe(speech) ||
      lower.includes("help me") ||
      lower.includes("i don't know") ||
      lower.includes("not sure")
    ) {
      state.scenarioLocked = true;

      const sayText =
        "Okay. I will pick an easy one. Ring ring. " +
        "Hello, thanks for calling. How can I help you today?";

      state.messages.push({ role: "assistant", content: sayText });

      res.type("text/xml").send(twimlSayGather({ sayText, actionUrl }));
      return;
    }

    if (looksLikeScenarioRequest(speech)) {
      state.scenarioLocked = true;

      const sayText =
        "Got it. Ring ring. " +
        "Hello, thanks for calling. How can I help you today?";

      state.messages.push({ role: "assistant", content: sayText });

      res.type("text/xml").send(twimlSayGather({ sayText, actionUrl }));
      return;
    }

    const clarify =
      "Okay. Do you want to pick a scenario, like doctor, school office, job interview, or ordering food, " +
      "or should I pick one for you?";
    state.messages.push({ role: "assistant", content: clarify });
    res.type("text/xml").send(twimlSayGather({ sayText: clarify, actionUrl }));
    return;
  }

  // Normal AI turn after scenario started
  const modelMessages = [{ role: "system", content: systemPrompt() }, ...state.messages];

  let aiText = "";
  try {
    aiText = await openaiChat(modelMessages);
  } catch {
    aiText = "Sorry, I hit a little glitch. Want to try that again? What would you say next?";
  }

  // Keep history trimmed
  state.messages.push({ role: "assistant", content: aiText });
  if (state.messages.length > 24) {
    state.messages = [state.messages[0], ...state.messages.slice(-22)];
  }

  res.type("text/xml").send(twimlSayGather({ sayText: aiText, actionUrl }));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Listening on port " + port);
});
