// After the welcome line is spoken, say one more line, then listen.
// Small delay so it feels like a natural handoff.
setTimeout(() => {
  try {
    openaiWs.send(JSON.stringify({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: "Before we start, quick note, this is a beta, so there may be some glitches. When you are ready, tell me what kind of call you want to practice, or say choose for me. Then stop speaking and listen."
      }
    }));

    // Make sure turn detection is on so it listens after speaking.
    // If your code already sets turn_detection in session.update, you can skip this block.
    openaiWs.send(JSON.stringify({
      type: "session.update",
      session: {
        turn_detection: { type: "server_vad" }
      }
    }));
  } catch (e) {
    console.log("Failed to send follow up prompt:", e);
  }
}, 900);
