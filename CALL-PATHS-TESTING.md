# CallReady Complete Call Path Testing Guide

## Overview
This document maps every possible call path through the CallReady system with the specific voice inputs needed to trigger each transition.

---

## Call Path Legend

**Symbols:**
- `→` = Flow transition
- `[VOICE]` = User input required
- `(duration)` = Typical duration
- `*silent*` = No input / timeout

---

## Path 1: Auto-Suggested Scenario → Accept
**Duration:** ~3-5 minutes  
**Difficulty:** Easiest (fewest decisions)

```
/incoming 
  → /opener [dynamic greeting]
  → /gather-choose-scenario [says: "pick", "you choose", "surprise", etc.]
  → /process-choose-scenario [parses intent to pick]
  → /gather-confirm-doctor [asks: "Does that sound good?"]
  → /process-confirm-doctor [says: "yes", "yeah", "sure", etc.]
  → /stream-roleplay [WebSocket to AI] (2-5 min roleplay)
  → /gather-coaching-feedback [asks: "Want feedback?"]
  → /process-coaching-feedback [says: "yes" or "no"]
  → /gather-wrapup-soft-threshold [wrapping up message]
  → /end [SMS opt-in flow]
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Do you already have a call in mind...?": **Say "pick for me"** or **"you choose"**
2. When asked "Does that sound good?": **Say "yes"** or **"sure"**
3. When asked "Want feedback?": **Say "yes"** or **"no"**
4. When asked about SMS: **Press 1** (yes) or **Press 2** (no)

---

## Path 2: Auto-Suggested Scenario → Reject → Choose Manual
**Duration:** ~4-6 minutes

```
/incoming 
  → /opener
  → /gather-choose-scenario [says: "pick"]
  → /process-choose-scenario
  → /gather-confirm-doctor [asks: "Does that sound good?"]
  → /process-confirm-doctor [says: "no", "nope", "different", etc.]
  → /gather-scenario-menu [offers 3 options]
  → /process-scenario-menu [says: "doctor" OR "pharmacy" OR "school"]
  → /stream-roleplay (2-5 min)
  → /gather-coaching-feedback
  → /process-coaching-feedback
  → /gather-wrapup-soft-threshold
  → /end
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Do you already have a call in mind?": **Say "pick"**
2. When asked "Does that sound good?": **Say "no"** or **"different"**
3. When offered 3 menu options: **Say "pharmacy"** (or doctor/school) OR **Press 2**
4. Continue with coaching/SMS flow

---

## Path 3: Caller Has Scenario in Mind → AI Match Found → Accept Match
**Duration:** ~4-6 minutes

```
/incoming 
  → /opener
  → /gather-choose-scenario [says: "i have one", "yes", "specific", etc.]
  → /process-choose-scenario [detects: "i have one"]
  → /gather-describe-call [asks: "Tell me what kind of call..."]
  → /process-describe-call [receives: "calling a doctor to reschedule"]
    [OpenAI matching: 80% confidence ≥ threshold of 75%]
  → /gather-confirm-suggested-scenario [says: "We'll practice calling a doctor's office..."]
  → /process-confirm-suggested-scenario [says: "yes", "sure", "sounds right", etc.]
  → /stream-roleplay (2-5 min with doctor checklist)
  → /gather-coaching-feedback
  → /process-coaching-feedback
  → /gather-wrapup-soft-threshold
  → /end
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Do you already have a call in mind?": **Say "I have one in mind"** or **"yes"**
2. When asked "Tell me what kind of call...": **Say "calling a doctor's office to schedule an appointment"**
3. When asked "Does that sound right?": **Say "yes"**
4. Continue with roleplay/coaching/SMS

---

## Path 4: Caller Has Scenario → AI Match → Reject → Custom Call → Accept Custom
**Duration:** ~5-7 minutes

```
/incoming 
  → /opener
  → /gather-choose-scenario [says: "i have one"]
  → /process-choose-scenario
  → /gather-describe-call [says: "calling a doctor's office"]
  → /process-describe-call [OpenAI: 82% confidence match found]
  → /gather-confirm-suggested-scenario [says: "no", "nope", "different", etc.]
  → /process-confirm-suggested-scenario [detects rejection]
  → /gather-custom-call-confirmation [asks: "Want to try a custom call?"]
  → /process-custom-call-confirmation [says: "yes", "sure", "okay", etc.]
    [Hash created: custom_a1b2c3d4]
  → /stream-roleplay (2-5 min with CUSTOM CHECKLIST - 6 gates)
  → /gather-coaching-feedback
  → /process-coaching-feedback
  → /gather-wrapup-soft-threshold
  → /end
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Do you already have a call in mind?": **Say "I have one"**
2. When asked "Tell me what kind of call...": **Say "calling a dentist to schedule a cleaning"**
3. When asked "Does that sound right?": **Say "no"** or **"not exactly"**
4. When asked "Want to try a custom call?": **Say "yes"** or **"okay"**
5. Continue with custom roleplay

---

## Path 5: Caller Describes Call → No Match Found → Offers Custom → Accepts
**Duration:** ~5-7 minutes

```
/incoming 
  → /opener
  → /gather-choose-scenario [says: "i have one"]
  → /process-choose-scenario
  → /gather-describe-call [says: "calling to cancel my gym membership"]
  → /process-describe-call [OpenAI: 35% confidence - NO MATCH, < 75% threshold]
  → /gather-custom-call-confirmation [says: "Want to try a custom call?"]
  → /process-custom-call-confirmation [says: "yes"]
    [Hash created: custom_x7y8z9a0]
  → /stream-roleplay (2-5 min with CUSTOM CHECKLIST)
  → /gather-coaching-feedback
  → /process-coaching-feedback
  → /gather-wrapup-soft-threshold
  → /end
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Do you already have a call in mind?": **Say "yes"**
2. When asked "Tell me what kind of call...": **Say "calling to cancel my gym membership"**
3. When asked "Want to try custom?": **Say "yes"**
4. Continue with roleplay

---

## Path 6: Caller Describes Call → No Match → Declines Custom → Returns to Menu
**Duration:** ~5-7 minutes

```
/incoming 
  → /opener
  → /gather-choose-scenario [says: "i have one"]
  → /process-choose-scenario
  → /gather-describe-call [says: "calling about something obscure"]
  → /process-describe-call [OpenAI: 25% confidence - NO MATCH]
  → /gather-custom-call-confirmation [asks: "Want custom?"]
  → /process-custom-call-confirmation [says: "no", "nope", "pass", etc.]
  → /gather-scenario-menu [fall back to 3-option manual menu]
  → /process-scenario-menu [says: "doctor" OR "pharmacy" OR "school"]
  → /stream-roleplay (2-5 min)
  → /gather-coaching-feedback
  → /process-coaching-feedback
  → /gather-wrapup-soft-threshold
  → /end
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Do you already have a call in mind?": **Say "yes"**
2. When asked "Tell me what kind of call...": **Say "something very unusual"**
3. When asked "Want to try custom?": **Say "no"** or **"not really"**
4. When offered menu: **Say "pharmacy"** or **Press 2**
5. Continue with roleplay

---

## Path 7: Returning Caller → Re-Practice Previous Scenario
**Duration:** ~3-5 minutes

```
/incoming 
  → (DB lookup: Found prior scenario_tag = "doctor_default")
  → /opener [mentions previous session]
  → /gather-choose-scenario [logic redirects to...]
  → /gather-previous-scenario [asks: "Want to practice calling a doctor's office again?"]
  → /process-previous-scenario [says: "yes", "sure", etc.]
  → /stream-roleplay (2-5 min with DOCTOR checklist)
  → /gather-coaching-feedback
  → /process-coaching-feedback
  → /gather-wrapup-soft-threshold
  → /end
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Want to practice [previous scenario] again?": **Say "yes"** or **"sure"**
2. Continue with roleplay

---

## Path 8: Returning Caller → Decline Previous → Describe New Call
**Duration:** ~5-7 minutes

```
/incoming 
  → (DB lookup: Found prior scenario_tag = "pharmacy_refill")
  → /opener
  → /gather-choose-scenario
  → /gather-previous-scenario [asks: "Practice pharmacy again?"]
  → /process-previous-scenario [says: "no", "different", etc.]
  → /gather-describe-call [asks: "Tell me what kind of call..."]
  → /process-describe-call [OpenAI matching...]
  → [Branches to match/custom flow]
  → /stream-roleplay
  → /gather-coaching-feedback
  → /process-coaching-feedback
  → /gather-wrapup-soft-threshold
  → /end
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Practice pharmacy again?": **Say "no"** or **"something different"**
2. When asked "Tell me what kind of call...": **Describe new call**
3. Continue based on matching result

---

## Path 9: Returning Caller → Re-Practice Custom Scenario
**Duration:** ~3-5 minutes

```
/incoming 
  → (DB lookup: Found prior scenario_tag = "custom_a1b2c3d4")
  → /opener
  → /gather-choose-scenario
  → /gather-previous-scenario [asks: "Want to practice [custom description] again?"]
  → /process-previous-scenario [says: "yes"]
    [Retrieves user_custom_description from DB: "calling a salon to reschedule"]
  → /stream-roleplay (2-5 min with CUSTOM CHECKLIST - same 6 gates)
  → /gather-coaching-feedback
  → /process-coaching-feedback
  → /gather-wrapup-soft-threshold
  → /end
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Want to practice [custom description] again?": **Say "yes"**
2. Continue with roleplay

---

## Path 10: Silent Timeout in /gather-choose-scenario (Retry Logic)
**Duration:** ~6-8 minutes

```
/incoming 
  → /opener
  → /gather-choose-scenario [SILENT - user doesn't respond]
    (3 second timeout, redirects with retryCount=1)
  → /gather-choose-scenario?retryCount=1 [Retry 1 SILENT]
    (redirects with retryCount=2)
  → /gather-choose-scenario?retryCount=2 [Retry 2 SILENT]
    (redirects with retryCount=3, but system detects ≥ 2 and HANGS UP)
  → Says: "It looks like I might be having trouble hearing you..."
  → /hangup
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Do you already have a call in mind?": **Say nothing** (3 times)
2. Call automatically ends after 2 silent retries

---

## Path 11: Silent Timeout in /gather-describe-call (Retry Logic)
**Duration:** ~4-5 minutes

```
/incoming 
  → /opener
  → /gather-choose-scenario [says: "i have one"]
  → /process-choose-scenario
  → /gather-describe-call [SILENT - user doesn't respond]
    (4 second timeout, redirects to retry=1)
  → /gather-describe-call?retry=1 [Retry 1 SILENT]
    (confidence check fails, still retries)
  → /gather-describe-call?retry=2 [User finally responds or gives up]
  → /process-describe-call [might offer custom or menu]
  → ... continues
```

**Voice Inputs to Trigger:**
1. When asked "Tell me what kind of call...": **Say nothing** on first attempt
2. System retries after timeout
3. Respond on retry or let it timeout again

---

## Path 12: User Requests End During Roleplay
**Duration:** ~2-3 minutes

```
/incoming 
  → /opener
  → /gather-choose-scenario [says: "pick"]
  → /process-choose-scenario
  → /gather-confirm-doctor [says: "yes"]
  → /process-confirm-doctor
  → /stream-roleplay [2-3 min in] [says: "quit", "end", "hang up", "stop", etc.]
    (OpenAI detects reroute phrase)
  → /end [skips coaching/wrapup]
  → SMS opt-in flow
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. When asked "Do you already have a call in mind?": **Say "pick"**
2. When asked "Does that sound good?": **Say "yes"**
3. After roleplay starts, say: **"quit"**, **"end"**, **"hang up"**, **"stop"**, or **"goodbye"**
4. Call routes to ending phase

---

## Path 13: User Hits 20-Second Connecting Phase Timeout
**Duration:** ~20+ seconds

```
/incoming 
  → /opener
  → /gather-choose-scenario [says: "pick"]
  → /process-choose-scenario
  → /gather-confirm-doctor [says: "yes"]
  → /process-confirm-doctor
  → /stream-roleplay [WebSocket connecting...]
    (20 seconds pass with no AI response/connection)
  → CONNECTING_TIMEOUT watchdog fires
  → /end?soft_end=1 [Graceful timeout message]
  → SMS opt-in
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. Follow normal path to roleplay
2. Don't speak after roleplay starts (let 20 seconds pass)
3. System will timeout and end call

---

## Path 14: User Hits Soft Time Limit (Session Duration)
**Duration:** ~varies based on tier

```
/incoming 
  → /opener
  → [Full scenario selection & confirm]
  → /stream-roleplay [User in roleplay for many minutes]
    (Session duration threshold hit: varies by tier)
  → System gracefully transitions
  → /gather-wrapup-soft-threshold [wrapping up message]
  → /end?soft_end=1 [says: "Session ran over usual time..."]
  → SMS opt-in
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. Follow normal path
2. Engage in extended roleplay (5+ minutes)
3. System will detect time threshold and end gracefully

---

## Path 15: User Hits Hard Time Limit (Minutes Cap)
**Duration:** ~at cap duration

```
/incoming 
  → [Full flow with extended roleplay]
    (Hard ceiling duration hit: varies by tier)
  → /end?hard_end=1 [says: "Time's up..."]
  → SMS opt-in
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. Follow normal path
2. Continue through long sessions
3. System will forcefully end when hard cap is hit

---

## Path 16: Low Confidence Input in /process-choose-scenario
**Duration:** ~3-5 minutes (with retry)

```
/incoming 
  → /opener
  → /gather-choose-scenario [says something unclear: "ummmmmm.... maybe... not sure"]
  → /process-choose-scenario [confidence < 0.5]
  → /gather-choose-scenario?retryCount=1 [retry]
  → /process-choose-scenario [user says clearly this time]
  → [Continues normally]
  → ...
```

**Voice Inputs to Trigger:**
1. When asked "Do you already have a call in mind?": **Say something unclear/mumbled**
2. System will ask you to repeat
3. Respond more clearly second time

---

## Path 17: Multiple Retries in /gather-scenario-menu
**Duration:** ~5-6 minutes

```
/incoming 
  → /opener
  → /gather-choose-scenario [says: "pick"]
  → /process-choose-scenario
  → /gather-confirm-doctor [says: "no"]
  → /process-confirm-doctor
  → /gather-scenario-menu [offers 3 options]
  → /process-scenario-menu [user says something unclear]
  → /gather-scenario-menu?retry=1 [asks again]
  → /process-scenario-menu [user responds clearly]
  → /stream-roleplay
  → ...
```

**Voice Inputs to Trigger:**
1. Follow rejection path
2. When offered menu, say something unclea (e.g., "I don't know")
3. System retries with rephrased question
4. Respond with scenario choice second time

---

## Path 18: Coaching Feedback Accepted → Full Feedback Received
**Duration:** 1-2 minutes (for coaching segment)

```
[After roleplay completes]
  → /gather-coaching-feedback [asks: "Want feedback?"]
  → /process-coaching-feedback [says: "yes"]
  → [OpenAI generates 2-sentence feedback]
  → /deliver-coaching-feedback [plays back feedback via TwiML Say]
  → /gather-wrapup-soft-threshold
  → /end
```

**Voice Inputs to Trigger:**
1. After roleplay ends, when asked "Want feedback?": **Say "yes"**
2. Listen to AI feedback
3. Continue to wrap-up

---

## Path 19: Coaching Feedback Declined → Skip to Wrap-up
**Duration:** 30 seconds (coaching segment)

```
[After roleplay completes]
  → /gather-coaching-feedback [asks: "Want feedback?"]
  → /process-coaching-feedback [says: "no"]
  → /gather-wrapup-soft-threshold [skips feedback]
  → /end
```

**Voice Inputs to Trigger:**
1. After roleplay ends, when asked "Want feedback?": **Say "no"**
2. System skips feedback and goes to wrap-up

---

## Path 20: SMS Opt-In Yes → Consent Recorded
**Duration:** 30 seconds (ending segment)

```
[At ending phase]
  → /end [ending message]
  → [SMS opt-in gather]
  → User presses: 1 (yes)
  → [Records opted_in_sms_during_call = true]
  → [Thanks message]
  → /hangup
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. At ending, when offered SMS: **Press 1**

---

## Path 21: SMS Opt-In No → No Consent
**Duration:** 30 seconds (ending segment)

```
[At ending phase]
  → /end [ending message]
  → [SMS opt-in gather]
  → User presses: 2 (no)
  → [Records opted_in_sms_during_call = false]
  → [Thanks message]
  → /hangup
  → CALL ENDS
```

**Voice Inputs to Trigger:**
1. At ending, when offered SMS: **Press 2**

---

## Quick Reference: Key Transitions

### How to trigger each main path:

| **Path Goal** | **At "Do you have...?" Say:** | **Result** |
|---|---|---|
| Auto-suggest | "pick" / "choose" / "surprise" | → `/gather-confirm-doctor` |
| Manual menu | "I have one" / "yes" | → `/gather-scenario-menu` |
| AI matching | "I have one" (then describe call) | → `/gather-describe-call` |
| Custom call | Describe → no match or reject suggestion | → `/gather-custom-call-confirmation` |
| Previous | (Returning caller) "yes" | → `/gather-previous-scenario` |

### How to trigger special conditions:

| **Condition** | **Action** |
|---|---|
| Timeout / Silent | Say nothing (let 3+ seconds pass) |
| Low confidence | Mumble/unclear speech |
| Reject doctor | Say "no" / "different" at confirmation |
| End early | Say "quit" / "end" / "stop" during roleplay |
| Want feedback | Say "yes" when asked |
| No feedback | Say "no" when asked |
| SMS opt-in yes | Press **1** |
| SMS opt-in no | Press **2** |

---

## Testing Strategy

### Recommended Test Order

**Phase 1: Basic Happy Paths (Easy)**
1. Path 1: Auto-suggested → Accept
2. Path 2: Auto-suggested → Reject → Menu
3. Path 3: AI Match → Accept

**Phase 2: Custom Scenarios (Medium)**
4. Path 4: AI Match → Reject → Custom
5. Path 5: No Match → Custom
6. Path 6: No Match → Decline Custom

**Phase 3: Returning Caller (Medium)**
7. Path 7: Returning → Re-practice
8. Path 8: Returning → New call
9. Path 9: Returning → Custom re-practice

**Phase 4: Edge Cases (Hard)**
10. Path 10: Silent timeouts
11. Path 11: Describe call timeouts
12. Path 12: User quits early
13. Path 13: Connecting timeout
14. Path 14: Soft time limit
15. Path 15: Hard time limit

**Phase 5: Feedback & SMS (Easy)**
16. Path 18: Accept feedback
17. Path 19: Decline feedback
18. Path 20: SMS opt-in yes
19. Path 21: SMS opt-in no

---

## Notes for Live Testing

### Important Reminders

1. **Returning Caller Testing**: You'll need to **finish a complete call first** to register as a "returning caller" on the next call
2. **Custom Scenarios**: The custom hash is deterministic - saying "calling a salon to reschedule" will always create the same `custom_a1b2c3d4` tag
3. **AI Matching**: Describe calls similar to built-in scenarios to test matching, use unique descriptions to test no-match path
4. **Timeouts**: Let silence pass naturally (3+ seconds) to test retry logic
5. **Feedback**: Roleplay transcript quality affects coaching feedback quality

### Database Verification

After testing, you can verify paths with queries:

```sql
-- See all calls from this session
SELECT call_sid, scenario_tag, duration_seconds, ended_reason FROM calls 
WHERE phone_e164 = '+[YOUR_NUMBER]' 
ORDER BY started_at DESC LIMIT 20;

-- Check custom scenarios created
SELECT call_sid, user_custom_description, scenario_tag FROM calls 
WHERE user_custom_description IS NOT NULL 
ORDER BY started_at DESC;

-- Check opt-in status
SELECT phone_e164, opted_in_sms_during_call FROM calls 
WHERE opted_in_sms_during_call = true;
```

---

## Estimated Total Testing Time

- All 21 paths: **~2-3 hours** depending on roleplay length
- Happy paths only (1-6, 18-21): **~45 minutes**
- Edge cases only (10-17): **~1 hour**

Recommended: Test in phases over multiple sessions to avoid fatigue.
