# 🚀 Quick Start: Running Tests

## 30-Second Setup

### 1️⃣ Verification (One-time only)
```powershell
# Run this to verify everything is installed correctly
.\verify-setup.bat
```

### 2️⃣ Start Server (Terminal 1)
```powershell
npm start
```

Wait for: `Server running on port 3000`

### 3️⃣ Run Tests (Terminal 2)
```powershell
# Test new caller (default, most common)
.\test-caller-paths.ps1

# Or pick a different test path
.\test-caller-paths.ps1 -TestPath returning-caller
.\test-caller-paths.ps1 -TestPath coaching
.\test-caller-paths.ps1 -TestPath error-path
```

---

## 🎯 What to Expect

Each test will show:
- ✓ **Green checkmarks** for success
- **TwiML response** formatted as XML
- **Phase progression** through the call flow
- **Response status** (200 = good)

---

## 📋 Test Options

| Command | Tests |
|---------|-------|
| `.\test-caller-paths.ps1` | New caller (default) |
| `.\test-caller-paths.ps1 -TestPath new-caller` | First-time caller full flow |
| `.\test-caller-paths.ps1 -TestPath returning-caller` | Previous scenario option |
| `.\test-caller-paths.ps1 -TestPath coaching` | Feedback & wrap-up phases |
| `.\test-caller-paths.ps1 -TestPath error-path` | Error conditions |

---

## 📖 Documentation

- **Quick Reference:** `TEST-QUICK-REF.md`
- **Full Guide:** `TEST-GUIDE.md`
- **Custom Testing:** `MANUAL-TESTING.md`
- **Suite Overview:** `TEST-SUITE-README.md`

---

## ⚠️ Common Issues

### "Server not reachable"
```powershell
# Make sure server is running in another terminal
npm start
```

### "PowerShell script execution is disabled"
```powershell
# Run as administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Want to test custom scenarios?
See `MANUAL-TESTING.md` for PowerShell examples

---

## 🔍 What Gets Tested

| Path | Coverage |
|------|----------|
| **new-caller** | Opener → Scenario selection → Confirmation → Roleplay |
| **returning-caller** | Previous scenario option → Menu fallthrough |
| **coaching** | Feedback prompt → Wrap-up → Session end |
| **error-path** | No sessions error → Service unavailable |

---

## ✅ Success Checklist

- [ ] Server starts without errors
- [ ] `.\verify-setup.bat` shows all green checkmarks
- [ ] First test shows `✓ Response Status: 200` on all phases
- [ ] TwiML responses are properly formatted XML
- [ ] New Polly phrases appear in Say elements
- [ ] Phase transitions are correct
- [ ] No 404 or 500 errors

---

## 🎓 Example: Full Test Session

```
Terminal 1:
> npm start
[INFO] Server running on port 3000...

Terminal 2:
> .\test-caller-paths.ps1

════════════════════════════════════════════
PHASE 1: Opener
════════════════════════════════════════════
✓ Response Status: 200

TwiML Response:
<?xml version="1.0"?>
<Response>
  <Say voice="Polly.Matthew-Neural">
    Hi. This is CallReady...
  </Say>
  <Redirect>/gather-choose-scenario</Redirect>
</Response>

════════════════════════════════════════════
PHASE 2: Choose Scenario
════════════════════════════════════════════
✓ Response Status: 200

... (more phases) ...

✓ Test Suite Complete
```

---

## 🚀 Ready?

```powershell
# One command to verify + test
.\verify-setup.bat   # Check system
npm start            # In terminal 1
.\test-caller-paths.ps1   # In terminal 2
```

**Everything should show green ✓**

---

For detailed documentation, see the other markdown files in this directory.
