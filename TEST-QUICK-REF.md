# PowerShell Twilio Test Quick Reference

## One-Liners for Testing

### Test New Caller (Complete Flow)
```powershell
.\test-caller-paths.ps1 -TestPath new-caller
```

### Test Returning Caller (Previous Scenario Option)
```powershell
.\test-caller-paths.ps1 -TestPath returning-caller
```

### Test Coaching & Wrap-Up
```powershell
.\test-caller-paths.ps1 -TestPath coaching
```

### Test Errors
```powershell
.\test-caller-paths.ps1 -TestPath error-path
```

## Using the .bat Launcher

Double-click `test.bat` and enter the test path, or run:

```powershell
.\test.bat new-caller
.\test.bat returning-caller
.\test.bat coaching
```

## Custom Server Port (Non-Default)

```powershell
.\test-caller-paths.ps1 -TestPath new-caller -ServerUrl http://localhost:5000
```

## Custom Phone Number

```powershell
.\test-caller-paths.ps1 -TestPath new-caller -PhoneNumber "+14155551234"
```

## What Gets Tested in Each Path

### **new-caller**
✓ First-time greeting
✓ Scenario selection flow
✓ Menu parsing
✓ Scenario confirmation
✓ Transition to roleplay

### **returning-caller**
✓ Returning caller greeting (mentions sessions remaining)
✓ Previous scenario intercept
✓ Yes/No response handling
✓ Fallback to new scenario selection

### **coaching**
✓ Post-roleplay feedback prompt
✓ Feedback generation (AI)
✓ Wrap-up options
✓ Session end flow

### **error-path**
✓ No sessions remaining error
✓ Service unavailable handling

## Reading Output

Each test shows:
- **Phase number** and description
- **Endpoint URL** being called
- **Request body** sent (CallSid, SpeechResult, etc.)
- **HTTP status code** (200 = success)
- **Pretty-printed TwiML** response

## Typical Success Output

```
✓ Response Status: 200

TwiML Response:
---
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew-Generative">
    Welcome to CallReady...
  </Say>
  <Gather ...>
    ...
  </Gather>
</Response>
---
```

## Common Issues

| Issue | Solution |
|-------|----------|
| "Server not reachable" | Run `npm start` first |
| 404 errors | Check endpoint name in server.js |
| Timeout | Server is slow, increase timeout in script |
| Empty response | Server may have crashed, check logs |
| XML parse error | Endpoint returned invalid XML |

## Environment Setup Checklist

- [ ] Node.js installed
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file configured with:
  - TWILIO_ACCOUNT_SID
  - TWILIO_AUTH_TOKEN
  - DATABASE_URL (if needed)
  - PUBLIC_WSS_URL (if WebSocket testing)
- [ ] Server running (`npm start`)
- [ ] PowerShell execution policy allows scripts (or use `-ExecutionPolicy Bypass`)

## ExecutionPolicy Error?

If you get "PowerShell script execution is disabled on this system", run:

```powershell
# One-time fix (run as Administrator)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or bypass for single script
powershell -ExecutionPolicy Bypass -File "test-caller-paths.ps1" -TestPath new-caller
```

## Next Steps

1. **Review Output** - Check TwiML shows correct flow transitions
2. **Verify Phrases** - Confirm new Twilio Say phrases are present
3. **Test Different Responses** - Modify SpeechResult values to test edge cases
4. **Check Logs** - Watch server console for any warnings/errors
5. **Database Tests** - If using returning caller path, verify database has prior call records

---

For full documentation, see `TEST-GUIDE.md`
