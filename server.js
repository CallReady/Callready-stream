const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;

const VOICE = "Polly.Salli";

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

function say(text) {
  return `<Say voice="${VOICE}">${esc(text)}</Say>`;
}

function pauseSeconds(len = 1) {
  return `<Pause length="${len}"/>`;
}

function gatherBlock({ action, timeout = 7, promptText, method = "POST", input = "speech dtmf" }) {
  return `
<Gather input="${input}" language="en-US" speechModel="phone_call" speechTimeout="auto" timeout="${timeout}" action="${action}" method="${method}">
  ${say(promptText)}
</Gather>`;
}

function safeFailTwiML() {
  return twiml(
    [
      say("Sorry, something went wrong on my end. Please call back and try again."),
      "<Hangup/>"
    ].join("\n")
  );
}

function safeHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      console.log("Route error:", e && e.message ? e.message : e);
      res.type("text/xml").send(safeFailTwiML());
    }
  };
}

function buildScenario(name) {
  if (name === "doctor") {
    return {
      intro:
        "Okay. We will practice calling a doctor's office to schedule an appointment. I will be the receptionist.",
      openingLine: "Good morning. Valley Family Clinic. How can I help you today?",
      steps: [
        {
          afterUser: () => "Thanks. What day were you hoping to come in?",
          helpIfQuiet:
            "If you are stuck, you could say, Hi, I would like to schedule an appointment. Do you have anything available this week?"
        },
        {
          afterUser: () => "Got it. Is this for a routine checkup, or something specific?",
          helpIfQuiet:
            "You can keep it simple. You could say, It is a routine checkup. Or, I have a quick question for the doctor."
        },
        {
          afterUser: () => "Okay. What time of day usually works best for you, mornings or afternoons?",
          helpIfQuiet:
            "You could say, Afternoons usually work best. Or, Mornings are better for me."
        },
        {
          afterUser: () =>
            "Perfect. If I ask for details like a name or date of birth, you can make something up for practice. What day were you thinking?",
          helpIfQuiet:
            "You could say, How about Thursday? Or, Any day next week works."
        }
      ],
      wrapUp:
        "Nice work. You stayed calm and clear. Want to try that same call again, or switch to a different scenario?"
    };
  }

  if (name === "job") {
    return {
      intro:
        "Okay. We will practice calling a workplace to follow up on a job application. I will be the manager.",
      openingLine: "Hello, this is Jordan speaking. How can I help?",
      steps: [
        {
          afterUser: () => "Thanks. What position did you apply for?",
          helpIfQuiet:
            "You could say, Hi, I applied for the cashier position, and I wanted to check on the status."
        },
        {
          afterUser: () => "Got it. When did you apply?",
          helpIfQuiet: "You could say, A couple days ago. Or, last week."
        },
        {
          afterUser: () => "Okay. Are you available for an interview this week?",
          helpIfQuiet:
            "You could say, Yes. I am free after three on weekdays. Or, Saturday morning works too."
        }
      ],
      wrapUp:
        "Nice. That sounded confident. Want to run it again, or switch scenarios?"
    };
  }

  return {
    intro:
      "Okay. We will start with something easy. You are calling a store to ask if an item is in stock. I will be the employee.",
    openingLine: "Thanks for calling. How can I help today?",
    steps: [
      {
        afterUser: () => "Sure. What item are you looking for?",
        helpIfQuiet:
          "You could say, Hi, I was wondering if you have a phone charger in stock. Or, Do you have any notebooks right now?"
      },
      {
        afterUser: () => "Got it. What color or type do you need?",
        helpIfQuiet:
          "You could say, Any color is fine. Or, I need the USB C type."
      },
      {
        afterUser: () => "Okay. Do you want me to hold one for you at the counter?",
        helpIfQuiet:
          "You could say, Yes please, that would be great. Or, No thanks, I will come by later."
      }
    ],
    wrapUp: "That was solid. Want to try again, or pick a different scenario?"
  };
}

function chooseForMeIntent(text) {
  const t = (text || "").toLowerCase().trim();
  if (!t) return false;
  const phrases = [
    "choose for me",
    "you choose",
    "pick for me",
    "surprise me",
    "anything",
    "whatever",
    "i don't know",
    "you decide",
    "doesn't matter",
    "choose one",
    "pick one"
  ];
  return phrases.some((p) => t.includes(p));
}

function scenarioFromText(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("doctor") || t.includes("appointment") || t.includes("clinic")) return "doctor";
  if (t.includes("job") || t.includes("application") || t.includes("interview")) return "job";
  return "easy";
}

function entry(req, res) {
  const opener =
    "Welcome to CallReady. A safe place to practice real phone calls before they matter. " +
    "I am an AI practice partner, so there is no pressure and no judgment. " +
    "Quick note, this is a beta, so you might notice an occasional glitch. " +
    "Would you like to choose a scenario, or should I choose an easy one for you? " +
    "You can say doctor appointment, job follow up, or choose for me. You can also press any key.";

  const xml = twiml(
    [
      say(opener),
      gatherBlock({
        action: "/choose",
        timeout: 8,
        promptText: "Go ahead.",
        input: "speech dtmf"
      }),
      say("I did not catch that. Say a scenario, or say choose for me, or press any key."),
      gatherBlock({
        action: "/choose",
        timeout: 8,
        promptText: "Go ahead.",
        input: "speech dtmf"
      }),
      say("No worries. Please call back when you are ready to practice. Goodbye."),
      "<Hangup/>"
    ].join("\n")
  );

  res.type("text/xml").send(xml);
}

app.post("/twiml", safeHandler((req, res) => entry(req, res)));
app.post("/voice", safeHandler((req, res) => entry(req, res)));

app.post("/choose", safeHandler((req, res) => {
  const speech = (req.body.SpeechResult || "").trim();
  const digits = (req.body.Digits || "").trim();

  let picked = "easy";
  if (digits) {
    picked = "easy";
  } else if (chooseForMeIntent(speech)) {
    picked = "easy";
  } else {
    picked = scenarioFromText(speech);
  }

  const scenario = buildScenario(picked);

  const intro =
    scenario.intro +
    " Here is how it works. I speak as the other person. Then you respond. " +
    "If you go quiet, I can offer a suggestion. Ready?";

  const xml = twiml(
    [
      say(intro),
      pauseSeconds(1),
      say("Ring ring."),
      pauseSeconds(1),
      say(scenario.openingLine),
      pauseSeconds(1),

      `<Gather input="speech" language="en-US" speechModel="phone_call" speechTimeout="auto" timeout="9" action="/step?s=${encodeURIComponent(
        picked
      )}&i=0" method="POST"></Gather>
${say("I did not catch that. If you want a quick suggestion, say yes. Or just start talking.")}
<Gather input="speech dtmf" language="en-US" speechModel="phone_call" speechTimeout="auto" timeout="7" action="/quiet?s=${encodeURIComponent(
        picked
      )}&i=0" method="POST"></Gather>
${say("Okay. Please call back when you are ready. Goodbye.")}
<Hangup/>`
    ].join("\n")
  );

  res.type("text/xml").send(xml);
}));

app.post("/quiet", safeHandler((req, res) => {
  const s = req.query.s || "easy";
  const i = parseInt(req.query.i || "0", 10);
  const scenario = buildScenario(s);
  const speech = (req.body.SpeechResult || "").toLowerCase();
  const digits = (req.body.Digits || "").trim();

  const wantsHelp = Boolean(digits || speech.includes("yes") || speech.includes("help") || speech.includes("sure"));

  const helpLine = scenario.steps[i]
    ? scenario.steps[i].helpIfQuiet
    : "You can start with, Hi, I am calling about something quick.";

  const xml = twiml(
    [
      wantsHelp ? say("Sure. Here is one simple way to say it.") : say("No problem. Take your time."),
      pauseSeconds(1),
      wantsHelp ? say(helpLine) : "",
      pauseSeconds(1),
      say("Whenever you are ready, go ahead."),

      `<Gather input="speech" language="en-US" speechModel="phone_call" speechTimeout="auto" timeout="10" action="/step?s=${encodeURIComponent(
        s
      )}&i=${i}" method="POST"></Gather>
${say("I am still here. If you want help, say yes.")}
<Gather input="speech dtmf" language="en-US" speechModel="phone_call" speechTimeout="auto" timeout="7" action="/quiet?s=${encodeURIComponent(
        s
      )}&i=${i}" method="POST"></Gather>
${say("Okay. We can stop here. Call back anytime to practice again. Goodbye.")}
<Hangup/>`
    ].join("\n")
  );

  res.type("text/xml").send(xml);
}));

app.post("/step", safeHandler((req, res) => {
  const s = req.query.s || "easy";
  const i = parseInt(req.query.i || "0", 10);
  const scenario = buildScenario(s);

  if (!scenario.steps[i]) {
    const xml = twiml(
      [
        pauseSeconds(1),
        say("Nice work."),
        pauseSeconds(1),
        say(scenario.wrapUp),
        pauseSeconds(1),
        gatherBlock({
          action: "/choose",
          timeout: 8,
          promptText: "Say try again, or say doctor appointment, or job follow up. Or press any key.",
          input: "speech dtmf"
        }),
        say("No worries. Call back anytime. Goodbye."),
        "<Hangup/>"
      ].join("\n")
    );
    res.type("text/xml").send(xml);
    return;
  }

  const agentLine = scenario.steps[i].afterUser(req.body.SpeechResult || "");
  const nextIndex = i + 1;

  const xml = twiml(
    [
      pauseSeconds(1),
      say(agentLine),
      pauseSeconds(1),

      `<Gather input="speech" language="en-US" speechModel="phone_call" speechTimeout="auto" timeout="9" action="/step?s=${encodeURIComponent(
        s
      )}&i=${nextIndex}" method="POST"></Gather>
${say("If you want help with what to say, say yes. Or just start talking.")}
<Gather input="speech dtmf" language="en-US" speechModel="phone_call" speechTimeout="auto" timeout="7" action="/quiet?s=${encodeURIComponent(
        s
      )}&i=${nextIndex}" method="POST"></Gather>
${say("Okay. We can stop here. Call back anytime to practice again. Goodbye.")}
<Hangup/>`
    ].join("\n")
  );

  res.type("text/xml").send(xml);
}));

app.get("/", (req, res) => {
  res.status(200).send("CallReady is running.");
});

app.listen(PORT, () => {
  console.log("CallReady server running on port " + PORT);
});
