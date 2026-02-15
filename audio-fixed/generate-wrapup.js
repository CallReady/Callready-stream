const fs = require("fs");
const path = require("path");

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

async function run() {
  const text = "Nice work. You can practice again anytime.";

  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      response_format: "mp3",
      input: text,
    }),
  });

  if (!resp.ok) {
    console.error("TTS failed", await resp.text());
    process.exit(1);
  }

  const buf = Buffer.from(await resp.arrayBuffer());

  const outDir = path.join(__dirname, "audio-fixed");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const outPath = path.join(outDir, "wrapup.mp3");
  fs.writeFileSync(outPath, buf);

  console.log("wrapup.mp3 written to audio-fixed/");
}

run();
