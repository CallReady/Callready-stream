# Roleplay Simulator Endpoints

Text-based roleplay simulator for development and testing. Exercises the same state machine logic as production without Twilio audio or WebSocket connections.

## Enabling the Simulator

Set environment variable before starting the server:

```bash
# Enable simulator endpoints
ENABLE_ROLEPLAY_SIM=true node server.js
```

If `ENABLE_ROLEPLAY_SIM` is not set to `true`, all simulator endpoints return `404 Not Found`.

## Endpoints

### POST /dev/roleplay/start

Initialize a simulator session for text-based roleplay.

**Request:**
```json
{
  "callSid": "CA_SIM_001",
  "scenarioTag": "doctor_default"
}
```

**Response:**
```json
{
  "ok": true,
  "callSid": "CA_SIM_001",
  "scenarioTag": "doctor_default",
  "mode": "flex",
  "next": {
    "slotId": "patient_name",
    "promptPreview": "Collect patient's full name"
  }
}
```

**What it does:**
- Initializes internal callState in memory (similar to real Twilio call)
- Loads and normalizes scenario config
- Builds checklist of required slots
- Sets roleplayGate to "collecting"
- Resets all reprompt levels and validation flags

**Max simulator calls:** 50 (oldest pruned when exceeded)

---

### POST /dev/roleplay/utterance

Process a caller utterance and generate the next AI response.

**Request:**
```json
{
  "callSid": "CA_SIM_001",
  "utterance": "My name is John Smith"
}
```

**Response:**
```json
{
  "ok": true,
  "state": {
    "currentTarget": "patient_phone",
    "roleplayGate": "collecting",
    "checklistSummary": {
      "done": ["patient_name"],
      "remaining": ["patient_phone", "appointment_date"]
    },
    "repromptLevel": 0,
    "turnCount": 2
  },
  "ai": {
    "text": "Thank you, John. And what's the best phone number to reach you?",
    "turnResult": null
  }
}
```

**What it does:**

1. **Stores utterance** in `callState.lastUserUtterance` and transcript
2. **Validation** (if flex mode with server validation):
   - Validates utterance against slot requirements
   - Auto-completes slot if valid
   - Increments reprompt level if invalid
3. **Closing gate check**:
   - If all slots done: transitions to `closing_pending`
4. **AI response generation**:
   - Calls `buildPhaseInstructions()` (same as production)
   - Sends text-only request to OpenAI
   - Applies flexible mode guardrails (if enabled):
     - Blocks unsafe content with redirect
     - Truncates response to 260 chars / 3 sentences
5. **Tool call parsing** (basic):
   - Detects `mark_checklist_item_complete()` and marks slot done
   - Detects `report_turn_result()` for flex mode tracking
   - Auto-generates missing turn result (with reprompt increment) if in flex mode
6. **Returns state** with next slot info and AI response text

**Notes:**
- Reuses exact same validation logic as production
- Same extraction and reprompt ladder as production
- Safe for testing without audio/websocket overhead

---

### POST /dev/roleplay/reset

Clear all simulator session states.

**Request:**
```json
{}
```

**Response:**
```json
{
  "ok": true,
  "message": "Simulator states cleared",
  "clearedCount": 5
}
```

---

## Usage Example

**PowerShell:**
```powershell
# Start simulator
$start = Invoke-WebRequest -Method POST `
  -Uri "http://localhost:3000/dev/roleplay/start" `
  -ContentType "application/json" `
  -Body '{"callSid":"CA_SIM_001","scenarioTag":"doctor_default"}' | ConvertFrom-Json

write-host "Next slot: $($start.next.slotId)"

# Send utterance
$utt = Invoke-WebRequest -Method POST `
  -Uri "http://localhost:3000/dev/roleplay/utterance" `
  -ContentType "application/json" `
  -Body '{"callSid":"CA_SIM_001","utterance":"My name is John"}' | ConvertFrom-Json

write-host "AI says: $($utt.ai.text)"
write-host "Progress: $($utt.state.checklistSummary.done.Length) done, $($utt.state.checklistSummary.remaining.Length) remaining"
```

**Bash:**
```bash
# Start simulator
curl -X POST http://localhost:3000/dev/roleplay/start \
  -H "Content-Type: application/json" \
  -d '{"callSid":"CA_SIM_001","scenarioTag":"doctor_default"}'

# Send utterance
curl -X POST http://localhost:3000/dev/roleplay/utterance \
  -H "Content-Type: application/json" \
  -d '{"callSid":"CA_SIM_001","utterance":"My name is John"}'
```

---

## Testing Workflow

1. **Enable simulator**: `ENABLE_ROLEPLAY_SIM=true npm start`
2. **Start a session**: `POST /dev/roleplay/start` with scenario tag
3. **Send utterances**: `POST /dev/roleplay/utterance` multiple times
4. **Watch state evolve**: Track checklist progress, reprompt levels, roleplay gate
5. **Reset**: `POST /dev/roleplay/reset` to clear for next test

---

## Logging

Simulator logs are prefixed with `[SIM]` for easy identification:

```
[2026-02-24T14:32:15.123Z] [SIM] /dev/roleplay/start { callSid: 'CA_SIM_001', scenarioTag: 'doctor_default' }
[2026-02-24T14:32:15.145Z] [SIM] callState initialized { callSid: 'CA_SIM_001', mode: 'flex', slotCount: 5 }
[2026-02-24T14:32:16.234Z] [SIM] /dev/roleplay/utterance { callSid: 'CA_SIM_001', utteranceLen: 20 }
[2026-02-24T14:32:16.340Z] [SIM] OpenAI response received { callSid: 'CA_SIM_001', responseLen: 87 }
```

Flexible mode guardrails also log with `[SIM]` prefix:
- `[SIM] [FLEX_SANITIZE]` - Response truncated for length
- `[SIM] [FLEX_BLOCKED_TEXT]` - Unsafe content detected and replaced
- `[SIM] [TURN_RESULT_MISSING]` - Auto-recovered missing tool call

---

## Reused Production Logic

The simulator exercises:
- ✅ `normalizeScenarioConfig()` - Config loading
- ✅ `validateCallerResponse()` - Slot validation
- ✅ `shouldUseFlexibleAsking()` - Mode detection
- ✅ `buildPhaseInstructions()` - AI instruction building
- ✅ `getNextTurnSpec()` - Slot ordering logic
- ✅ `sanitizeFlex()` - Response length enforcement
- ✅ `containsUnsafeContent()` - Content safety checks
- ✅ Reprompt ladder (auto-increment on validation failures)
- ✅ Closing gate state machine
- ✅ Checklist completion tracking

**NOT exercised** (simulator-only skips):
- ❌ Twilio audio/voice
- ❌ WebSocket connections
- ❌ Coaching phase transitions
- ❌ Call end/redirect logic

---

## Constraints

- **No new dependencies**: Uses existing OpenAI client and scenario loading
- **Memory-safe**: Prunes oldest simulator call if >50 active
- **Production-safe**: Disabled by default (env var guard)
- **Guarded endpoints**: Return 404 if `ENABLE_ROLEPLAY_SIM !== true`
- **Simple tool parsing**: Basic regex for tool detection (good enough for dev)
- **Text-only OpenAI**: Uses `gpt-4o-mini` for speed, no audio modality

---

## Common Issues

**Q: Endpoints return 404**
- A: Set `ENABLE_ROLEPLAY_SIM=true` before starting server

**Q: OpenAI API error**
- A: Ensure `OPENAI_API_KEY` is set in environment

**Q: Scenario not found**
- A: Check scenario tag (e.g., `doctor_default`, `pizza_order`, `dentist_appointment`)

**Q: Tool calls not parsing**
- A: Simulator uses basic regex parsing. Complex/malformed tool calls may not trigger (not critical for text testing)

---

## Tips for Testing

1. **Quick flex mode test**: Use `doctor_default` (already migrated to flex)
2. **Test reprompt ladder**: Send invalid inputs repeatedly to see level escalation
3. **Test validation paths**: Both flexible and legacy mode are tested
4. **Check logs**: `[SIM]` prefix makes simulator activity easy to track
5. **Reset between tests**: Call `POST /dev/roleplay/reset` to clear state
