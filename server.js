const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;

// -------- helpers --------
function esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${inner}
</Response>`;
}

const VOICE = "Polly.Salli";

function say(text) {
  return `<Say voice="${VOICE}">${esc(text)}</Say>`;
}

function pause(len = 1) {
  return `<Pause length="${len}"/>`;
}

// A Gather that supports speech and dtmf, with a reliable no-input fallback
function gather({ action, timeout = 6, promptText, noInputText, method = "POST" }) {
  return `
<Gather input="speech dtmf" speechTimeout="auto" timeout="${timeout}" action="${action}" method="${method}">
  ${say(promptText)}
</Gather>
${say(noInputText)}
`;
}

// -------- scripted scenarios --------
function buildScenario(name) {
  // Each scenario has:
  // - intro: what is happening
  // - agentRole: what the AI "is" in the roleplay
  // - openingLine: what the "other person" says to start the call
  // - steps: a few beats to guide the call
  if (name === "doctor") {
    return {
      title: "Doctor appointment",
      intro:
        "Okay. We will practice calling a doctor's office to schedule an appointment. I will be the receptionist.",
      openingLine:
        "Good morning. Valley Family Clinic. How can I help you today?",
      steps: [
        {
          afterUser: (u) =>
            "Thanks. What day were you hoping to come in?",
          helpIfQuiet:
            "If you are stuck, you could say, Hi, I would like to schedule an appointment. Do you have anything available this week?",
        },
        {
          afterUser: (u) =>
            "Got it. Is this for a routine checkup, or something specific?",
          helpIfQuiet:
            "You can keep it simple. You could say, It is a routine checkup. Or, I have a quick question for the doctor.",
        },
        {
          afterUser: (u) =>
            "Okay. What time of day usually works best for you, mornings or afternoons?",
          helpIfQuiet:
            "You could say, Afternoons usually work best. Or, Mornings are better for me.",
        },
        {
          afterUser: (u) =>
            "Perfect. One last thing. Do you want me to put this under a name, or would you rather stay anonymous for practice?",
          helpIfQuiet:
            "You can say, Just use a fake name for practice. Or, Leave it blank please.",
        },
      ],
      wrapUp:
        "Nice work. You stayed calm and clear. Want to try that same call again, or switch to a different scenario?",
    };
  }

  if (name === "job") {
    return {
      title: "Calling about a job application",
      intro:
        "Okay. We will practice calling a workplace to follow up on a job application. I will be the manager.",
      openingLine:
        "Hello, this is Jordan speaking. How can I help?",
      steps: [
        {
          afterUser: (u) =>
            "Thanks. What position did you apply for?",
          helpIfQuiet:
            "You could say, Hi, I applied for the cashier position, and I wanted to check on the status.",
        },
        {
          afterUser: (u) =>
            "Got it. When did you apply?",
          helpIfQuiet:
            "You could say, A couple days ago. Or, last week.",
        },
        {
          afterUser: (u) =>
            "Okay. Are you available for an interview this week?",
          helpIfQuiet:
            "You could say, Yes. I am free after three on weekdays. Or, Saturday morning works too.",
        },
      ],
      wrapUp:
        "Nice. That sounded confident. Want to run it again with a harder version, or switch scenarios?",
    };
  }

  // default easy scenario
  return {
    title: "Calling a local store",
    intro:
      "Okay. We will start with something easy. You are calling a store to ask if an item is in stock. I will be the employee.",
    openingLine:
      "Thanks for calling. How can I help today?",
    steps: [
      {
        afterUser: (u) =>
          "Sure. What item are you looking for?",
        helpIfQuiet:
          "You could say, Hi, I was wondering if you have a phone charger in stock. Or, Do you have any notebooks right now?",
      },
      {
        afterUser: (u) =>
          "Got it. What color or type do you need?",
        helpIfQuiet:
          "You could say, Any color is fine. Or, I need the USB C type.",
      },
      {
        afterUser: (u) =>
          "Okay. Do you want me to hold one for you at the counter?",
        helpIfQuiet:
          "You could say, Yes please, that would be great. Or, No thanks, I will come by later.",
      },
    ],
    wrapUp:
      "That was solid. Want to try again, or pick a different scenario?",
  };
}

// We keep the scenario and step in memory via query params.
// Simple, stable, no database.
function scenarioFromText(text) {
  const t = (text || "").toLowerCase();

  if (t.includes("doctor") || t.includes("appointment") || t.includes("clinic")) return "doctor";
  if (t.includes("job") || t.includes("application") || t.includes("interview")) return "job";
  if (t.includes("choose") || t.includes("you choose") || t.includes("surprise") || t.includes("anything")) return "easy";
  return "easy";
}

// -------- routes --------
function entry(req, res) {
  const opener =
    "Welcome to CallReady. A safe place to practice real phone calls before they matter." +
    " I am an AI practice partner, so there is no pressure and no judgment." +
    " Quick note, this is a beta, so you might notice an occasional glitch." +
    " Would you like to choose a scenario, or should I choose an easy one for you?";

  const xml = twiml(
    [
      say(opener),
      pause(1),
      gather({
        action: "/choose",
        timeout: 7,
        promptText:
          "You can say something like, doctor appointment. Or say, choose for me.",
        noInputText:
          "I did not hear anything. If you want, say, choose for me. Or tell me the kind of call you want to practice.",
      }),
      // Second attempt, then end politely
      gather({
        action: "/choose",
        timeout: 7,
        promptText:
          "Try again. Say a scenario, like job follow up, or say, choose for me.",
        noInputText:
          "No worries. Please call back when you are ready to practice. Goodbye.",
      }),
      `<Hangup/>`,
    ].join("\n")
  );

  res.type("text/xml").send(xml);
}

app.post("/twiml", entry);
app.post("/voice", entry);

app.post("/choose", (req, res) => {
  const speech = req.body.SpeechResult || "";
  const digits = req.body.Digits || "";

  // If they press any key, treat it as "choose for me"
  const picked = digits ? "easy" : scenarioFromText(speech);
  const scenario = buildScenario(picked);

  const intro =
    scenario.intro +
    " Here is how it will work." +
    " I will speak as the other person on the call." +
    " After I speak, you respond like you normally would." +
    " If you go quiet, I can help you with a suggestion." +
    " Ready?";

  const xml = twiml(
    [
      say(intro),
      pause(1),
      say("Ring ring."),
      pause(1),
      say(scenario.openingLine),
      pause(1),
      // Start step 0
      `
<Gather input="speech" speechTimeout="auto" timeout="8" action="/step?s=${encodeURIComponent(
        picked
      )}&i=0" method="POST">
</Gather>
${say("I did not catch that. Do you want a quick suggestion for what to say? You can say yes, or just start talking.")}
<Gather input="speech dtmf" speechTimeout="auto" timeout="6" action="/quiet?s=${encodeURIComponent(
        picked
      )}&i=0" method="POST">
</Gather>
${say("Okay. Please call back when you are ready. Goodbye.")}
<Hangup/>
`,
    ].join("\n")
  );

  res.type("text/xml").send(xml);
});

app.post("/quiet", (req, res) => {
  const s = req.query.s || "easy";
  const i = parseInt(req.query.i || "0", 10);
  const scenario = buildScenario(s);
  const speech = (req.body.SpeechResult || "").toLowerCase();
  const digits = req.body.Digits || "";

  const wantsHelp = digits || speech.includes("yes") || speech.includes("help") || speech.includes("sure");

  const helpLine = scenario.steps[i] ? scenario.steps[i].helpIfQuiet : "You can start with, Hi there, I am calling about something quick.";
  const prompt = wantsHelp
    ? "Sure. Here is one simple way to say it."
    : "No problem. Take your time.";

  const xml = twiml(
    [
      say(prompt),
      pause(1),
      wantsHelp ? say(helpLine) : "",
      pause(1),
      say("Whenever you are ready, go ahead."),
      `
<Gather input="speech" speechTimeout="auto" timeout="10" action="/step?s=${encodeURIComponent(
        s
      )}&i=${i}" method="POST">
</Gather>
${say("I am still here. If you want help, say yes.")}
<Gather input="speech dtmf" speechTimeout="auto" timeout="6" action="/quiet?s=${encodeURIComponent(
        s
      )}&i=${i}" method="POST">
</Gather>
${say("Okay. We can stop here. Call back anytime to practice again. Goodbye.")}
<Hangup/>
`,
    ].join("\n")
  );

  res.type("text/xml").send(xml);
});

app.post("/step", (req, res) => {
  const s = req.query.s || "easy";
  const i = parseInt(req.query.i || "0", 10);
  const scenario = buildScenario(s);

  const userSaid = req.body.SpeechResult || "";

  // If we're out of steps, wrap up
  if (!scenario.steps[i]) {
    const xml = twiml(
      [
        pause(1),
        say("Nice work."),
        pause(1),
        say(scenario.wrapUp),
        pause(1),
        gather({
          action: "/choose",
          timeout: 7,
          promptText:
            "Say, try again, or name a different scenario. Or press any key for an easy scenario.",
          noInputText:
            "No worries. Call back anytime. Goodbye.",
        }),
        `<Hangup/>`,
      ].join("\n")
    );
    res.type("text/xml").send(xml);
    return;
  }

  // Continue scripted flow
  const agentLine = scenario.steps[i].afterUser(userSaid);

  const nextIndex = i + 1;

  const xml = twiml(
    [
      pause(1),
      say(agentLine),
      pause(1),
      `
<Gather input="speech" speechTimeout="auto" timeout="8" action="/step?s=${encodeURIComponent(
        s
      )}&i=${nextIndex}" method="POST">
</Gather>
${say("If you want help with what to say, say yes. Or just start talking.")}
<Gather input="speech dtmf" speechTimeout="auto" timeout="6" action="/quiet?s=${encodeURIComponent(
        s
      )}&i=${nextIndex}" method="POST">
</Gather>
${say("Okay. We can stop here. Call back anytime to practice again. Goodbye.")}
<Hangup/>
`,
    ].join("\n")
  );

  res.type("text/xml").send(xml);
});

app.get("/", (req, res) => {
  res.status(200).send("CallReady is running.");
});

app.listen(PORT, () => {
  console.log("CallReady server running on port " + PORT);
});
