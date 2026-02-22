# CallReady Twilio Webhook Test Suite

This PowerShell test script simulates the complete Twilio webhook chain for different caller paths in the CallReady application. It replays the call flow step-by-step, reusing the same `CallSid` throughout, and displays the returned TwiML responses for visual inspection.

## Prerequisites

- PowerShell 5.1+ (Windows built-in)
- Node.js server running locally
- `npm start` running on default port 3000 (or specify custom port)

## Quick Start

### 1. Start the Server

```powershell
cd C:\Users\BradThompson\Documents\GitHub\Callready-stream
npm start
```

Wait for the server to start (should say "Server running on port 3000").

### 2. Run Tests in New PowerShell Terminal

```powershell
cd C:\Users\BradThompson\Documents\GitHub\Callready-stream
.\test-caller-paths.ps1 -TestPath new-caller
```

## Test Paths Available

### 1. **New Caller Path** (Default)
Tests a first-time caller going through the complete flow:
- `/voice` → Opener greeting
- `/gather-choose-scenario` → Do you have a call in mind that you'd like to practice?
- `/process-choose-scenario` → User says "no"
- `/gather-scenario-choice-confirm` → Okay, I'll pick something for us to work on. Does that sound good?
- `/process-scenario-choice-confirm` → User says "yes"
- `/gather-confirm-doctor` → Does this sound good?
- `/process-confirm-doctor` → User confirms

**Run:**
```powershell
.\test-caller-paths.ps1 -TestPath new-caller
```

### 2. **Returning Caller Path**
Tests a returning caller who's offered to re-practice their previous scenario:
- `/voice` → Opener (says sessions remaining)
- `/gather-choose-scenario` → Redirects to previous scenario check
- `/gather-previous-scenario` → Would you like to practice [scenario] again?
- `/process-previous-scenario` → User says NO (wants something different)
- Falls back to `/gather-scenario-menu` for new selection

**Run:**
```powershell
.\test-caller-paths.ps1 -TestPath returning-caller
```

### 3. **Coaching & Wrap-Up Path**
Tests the post-roleplay feedback and session continuation flow:
- `/gather-coaching-feedback` → Would you like feedback?
- `/process-coaching-feedback` → User says YES (or NO option)
- `/gather-wrap-up` → Practice again or end session?
- `/process-wrap-up` → User ends session

**Run:**
```powershell
.\test-caller-paths.ps1 -TestPath coaching
```

### 4. **Error Path**
Tests error conditions (requires database configuration):
- No sessions remaining
- Service unavailable

**Run:**
```powershell
.\test-caller-paths.ps1 -TestPath error-path
```

## Advanced Usage

### Custom Server URL
```powershell
.\test-caller-paths.ps1 -TestPath new-caller -ServerUrl "http://localhost:5000"
```

### Custom Phone Number
```powershell
.\test-caller-paths.ps1 -TestPath new-caller -PhoneNumber "+14155551234"
```

### Full Example
```powershell
.\test-caller-paths.ps1 -TestPath returning-caller -ServerUrl "http://localhost:3000" -PhoneNumber "+12025551234"
```

## What the Script Does

1. **Generates Unique CallSid**: Each test run creates a unique Call SID (e.g., `CA_123456_NEW`)
2. **Reuses Same CallSid**: All requests within a test path use the same CallSid for continuity
3. **Builds Request Payloads**: Simulates Twilio request bodies with realistic data
4. **Makes HTTP Requests**: POSTs to endpoints with `application/json` content
5. **Parses TwiML Response**: Extracts and pretty-prints XML responses
6. **Colors Output**: Green (success), Red (errors), Yellow (info), Cyan (headers)
7. **Displays Phase Progress**: Shows which phase of the call flow is executing

## Understanding the Output

```
════════════════════════════════════════════
PHASE 1: Opener (First-time caller greeting)
════════════════════════════════════════════
Endpoint: /voice
URL: http://localhost:3000/voice

Request Body:
{
  "CallSid": "CA_123456_NEW",
  "From": "+12025551234",
  ...
}

✓ Response Status: 200

TwiML Response:
---
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew-Neural">
    Welcome to CallReady...
  </Say>
  <Redirect>
    /gather-choose-scenario
  </Redirect>
</Response>
---
```

**Key Information:**
- **CallSid**: Unique identifier for this call
- **Endpoint**: Which server endpoint handled the request
- **Request Body**: What data was sent (CallSid, SpeechResult, etc.)
- **Response Status**: HTTP status code (200 = success)
- **TwiML Response**: XML returned by Twilio endpoint

## Troubleshooting

### Server Not Reachable
```
✗ Server not reachable at http://localhost:3000
  Make sure the server is running: npm start
```

**Solution**: Start the server in another terminal with `npm start`

### 404 Errors
```
StatusCode: NotFound
```

**Possible Causes:**
- Endpoint URL typo in test script
- Server hasn't started yet
- Endpoint not implemented in server.js

### JSON Parsing Errors
```
InvalidOperation: Cannot index into a null array.
```

**Solution**: Check that server is returning proper JSON or TwiML

### Connection Timeout
```
The operation has timed out.
```

**Solution**: Increase `-TimeoutSec` value in script (currently 10 seconds)

## Testing Specific Scenarios

### Test NO Response (Retry)
Modify the script to send empty `SpeechResult`:
```powershell
$processFeedbackBody = @{
    CallSid = $callSid
    SpeechResult = ""  # Empty - triggers retry
    Confidence = "0"
}
```

### Test Low Confidence
```powershell
$processFeedbackBody = @{
    CallSid = $callSid
    SpeechResult = "something"
    Confidence = "0.2"  # Low confidence triggers retry
}
```

### Test DTMF (Keypad Input)
```powershell
$processMenuBody = @{
    CallSid = $callSid
    Digits = "1"  # User pressed key 1
    SpeechResult = ""
}
```

## Call Flow Visualization

### New Caller Flow
```
[Call Initiated]
      ↓
   /voice (POST)
      ↓
   Opener TwiML
      ↓
/gather-choose-scenario
      ↓
/process-choose-scenario (User: "no")
      ↓
/gather-scenario-choice-confirm
      ↓
/process-scenario-choice-confirm (User: "yes")
      ↓
/gather-confirm-doctor (Confirm selection)
      ↓
/process-confirm-doctor (User: "yes")
      ↓
/stream-roleplay (WebSocket to AI)
      ↓
[Roleplay Active - User converses with AI]
      ↓
/gather-coaching-feedback
      ↓
[Coaching phase begins]
```

### Returning Caller Flow
```
[Call Initiated]
      ↓
   /voice (POST with prior context)
      ↓
   Opener (mentions sessions remaining)
      ↓
/gather-choose-scenario
      ↓
/gather-previous-scenario (Intercepts if prior scenario exists)
      ↓
/process-previous-scenario (User: "yes" or "no")
      ↓
      ├─ YES: /stream-roleplay (same scenario)
      └─ NO: /gather-choose-scenario (ask yes/no call-in-mind question)
```

## Database Considerations

The test script doesn't require database setup for basic testing. However, for accurate simulation of **returning callers** or **session limits**, the test server should have:

1. A test user phone number in the database
2. Prior call records with `scenario_tag` and `scenario_label`
3. Session usage/limits configured

To test these scenarios, you may need to:
```sql
-- Example: Set up a test caller
INSERT INTO callers (phone_e164) VALUES ('+12025551234');

-- Example: Add prior call record
INSERT INTO calls (call_sid, phone_e164, scenario_tag, scenario_label, started_at)
VALUES ('CA_TEST_001', '+12025551234', 'doctor_default', 'calling a doctor''s office to schedule an appointment', NOW());
```

## Performance Notes

- Each endpoint call takes ~100-500ms
- Complete new-caller path: ~2-3 seconds
- WebSocket streaming (roleplay) not tested in this script
- Database latency depends on your DB setup

## Extending the Script

To add a new test path, follow this pattern:

```powershell
function Test-CustomPath {
    $callSid = "CA_$(Get-Random -Minimum 100000 -Maximum 999999)_CUSTOM"
    
    # Phase 1
    Invoke-TwilioEndpoint `
        -Endpoint "/endpoint-1" `
        -Body @{ CallSid = $callSid; ... } `
        -PhaseNumber 1 `
        -PhaseName "Description"
    
    # Phase 2
    Invoke-TwilioEndpoint `
        -Endpoint "/endpoint-2" `
        -Body @{ CallSid = $callSid; ... } `
        -PhaseNumber 2 `
        -PhaseName "Description"
}
```

Then in the `switch` statement at the bottom:
```powershell
"custom-path" { Test-CustomPath }
```

Run with:
```powershell
.\test-caller-paths.ps1 -TestPath custom-path
```

## Support

For issues or questions:
1. Check logs from `npm start` in server terminal
2. Verify endpoints exist in server.js
3. Ensure request payloads match Twilio format
4. Check that CallSid is being passed correctly through phases
