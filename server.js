import express from "express";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 10000;

/*
  Escape text so it is safe inside Twilio <Say>
*/
function escapeForTwilio(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/*
  Build a TwiML response safely
*/
function twimlResponse(content) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${content}
</Response>`;
}

/*
  Entry point for incoming calls
*/
app.post("/twiml", (req, res) => {
  const opener =
    "Welcome to CallReady. A safe place to practice real phone calls before they matter. " +
    "I am an AI practice partner, so there is no pressure and no judgment. " +
    "Would you like to choose a specific type of call to practice, or should I choose an easy one for you?";

  const escaped = escapeForTwilio(opener);

  const xml = twimlResponse(`
<Say voice="Polly.Salli">${escaped}</Say>
<Gather input="speech dtmf" timeout="6" action="/choice" method="POST">
</Gather>
<Say voice="Polly.Salli">
I did not hear anything. Please say choose one for me, or tell me the kind of call you want to practice.
</Say>
<Gather input="speech dtmf" timeout="6" action="/choice" method="POST">
</Gather>
`);

  res.type("text/xml");
  res.send(xml);
});

/*
  Handle scenario choice
*/
app.post("/choice", (req, res) => {
  const speech = (req.body.SpeechResult || "").toLowerCase();

  let scenario;

  if (speech.includes("doctor") || speech.includes("appointment")) {
    scenario =
      "Great choice. We will practice calling a doctor's office to schedule an appointment. " +
      "I will play the receptionist. When you are ready, you can start speaking.";
  } else if (speech.includes("choose") || speech.includes("you decide")) {
    scenario =
      "No problem. We will start with a simple and friendly scenario. " +
      "You are calling a doctor's office to schedule a routine appointment. " +
      "When you are ready, you can begin.";
  } else {
    scenario =
      "That sounds good. We will practice a general phone call scenario. " +
      "I will respond like a real person would. You can start whenever you are ready.";
  }

  const escaped = escapeForTwilio(scenario);

  const xml = twimlResponse(`
<Say voice="Polly.Salli">${escaped}</Say>
<Gather input="speech" timeout="10" action="/practice" method="POST">
</Gather>
<Say voice="Polly.Salli">
I am still here when you are ready.
</Say>
<Gather input="speech" timeout="10" action="/practice" method="POST">
</Gather>
`);

  res.type("text/xml");
  res.send(xml);
});

/*
  Simple practice loop
*/
app.post("/practice", (req, res) => {
  const userSpeech = req.body.SpeechResult || "";

  const responseText =
    "Thanks for saying that. You sounded clear and polite. " +
    "Would you like to keep going, or try the call again from the beginning?";

  const escaped = escapeForTwilio(responseText);

  const xml = twimlResponse(`
<Say voice="Polly.Salli">${escaped}</Say>
<Gather input="speech dtmf" timeout="6" action="/choice" method="POST">
</Gather>
<Say voice="Polly.Salli">
You can say keep going, or start over.
</Say>
<Gather input="speech dtmf" timeout="6" action="/choice" method="POST">
</Gather>
`);

  res.type("text/xml");
  res.send(xml);
});

app.listen(PORT, () => {
  console.log("CallReady server running on port " + PORT);
});
