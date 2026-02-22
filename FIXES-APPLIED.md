# State Carryover &amp; Unconditional Redirect Fixes

## Problem Summary
The previous-scenario gather was instantly retrying without waiting for caller input due to two issues:

1. **Unconditional Fallback Redirects**: All Gather endpoints had fallback redirects that executed AFTER the Gather prompt was sent to the caller, causing immediate retries even when the caller was responding.
2. **State Carryover**: The retry count from `/gather-choose-scenario` was carrying over to `/gather-previous-scenario`, causing accumulated retry state.

## Root Causes Identified

### Issue 1: Unconditional Fallback Redirects in Gather Endpoints
The old pattern was:
```javascript
const gather = vr.gather({...});
gather.say(...);
vr.redirect({ method: "POST" }, "/some-endpoint?retry=1");  // ← Always executed!
res.send(vr.toString());
```

This caused:
- Gather prompt sent to caller → System immediately redirects with retry flag
- Caller attempting to speak → Redirect already fired
- Instant retry loop without waiting for response

### Issue 2: State Carryover Between Phases
No cleanup of retry counts when transitioning from choose_scenario → previous_scenario:
```javascript
// In /gather-previous-scenario
// twilioChooseScenarioRetries.get(callSid) still has old value from choose_scenario phase
```

## Fixes Applied

### 1. Removed Unconditional Fallback Redirects
Fixed 7 Gather endpoints by removing unconditional redirects:

- **`/gather-choose-scenario`** (line ~1972)
- **`/gather-previous-scenario`** (line ~2027)
- **`/gather-scenario-menu`** (line ~2202)
- **`/gather-describe-call`** (line ~2301)
- **`/gather-confirm-suggested-scenario`** (line ~2430)
- **`/gather-custom-call-confirmation`** (line ~2519)
- **`/gather-confirm-doctor`** (line ~2609)

**Pattern change:**
```javascript
// BEFORE
const gather = vr.gather({...});
gather.say(...);
vr.redirect({...});  // Always executed
res.send(vr.toString());

// AFTER  
const gather = vr.gather({...});
gather.say(...);
res.send(vr.toString());
// Timeout handling now done in /process-* handlers
```

### 2. Added State Cleanup in `/gather-previous-scenario`
```javascript
// Clear retry count from previous scenario selection phase
if (!retry && callSid) {
  twilioChooseScenarioRetries.delete(callSid);
}
```

### 3. Enhanced Timeout Handling in Process Handlers
Added explicit checks for timeout cases (empty/missing speechResult) in all process handlers:

#### `/process-choose-scenario`
- Check for empty speechResult before processing
- If no speech detected, redirect to retry with incremented counter
- Moved low-confidence check up

#### `/process-previous-scenario`
- Check for empty speechResult first
- Then check low confidence (< 0.5)
- Only process affirmative/negative patterns if both checks pass

#### `/process-confirm-suggested-scenario`
- Handle timeout (no speech) with explicit check
- Check low confidence before pattern matching
- Retry if either condition fails

#### `/process-custom-call-confirmation`
- Handle timeout (no speech) with explicit check
- Check low confidence before pattern matching
- Retry if either condition fails

#### `/process-confirm-doctor`
- Handle timeout (no speech) with explicit check
- Check low confidence before pattern matching
- Retry if either condition fails

## Result

Gathers now behave correctly:

1. ✅ Prompt is sent to caller
2. ✅ System waits for input (timeout: 3-5 seconds, speechTimeout: 4000ms)
3. ✅ If caller speaks → sent to process endpoint
4. ✅ If timeout → no speech in body → process endpoint detects and retries
5. ✅ If low confidence → process endpoint detects and retries
6. ✅ State is cleaned up between phases

## Testing Recommendations

### Test Case 1: Normal Response (Previous Scenario)
1. Call as returning user with prior scenario context
2. At "do you want to practice again?" → say "yes"
3. ✅ Should proceed to roleplay (not retry)

### Test Case 2: Timeout (Previous Scenario)
1. Call as returning user
2. At "do you want to practice again?" → say nothing
3. Wait 5+ seconds
4. ✅ Should retry with "Would you like to try that again..." prompt

### Test Case 3: Unclear Response (Previous Scenario)
1. Call as returning user
2. At "do you want to practice again?" → say something unrelated
3. ✅ Should retry same question

### Test Case 4: Low Confidence
1. Call as returning user
2. At "do you want to practice again?" → speak very quietly/unclear
3. ✅ Should retry same question

### Test Case 5: Choose Scenario Phase
1. Call as new user
2. At "do you have a call in mind?" → say nothing
3. ✅ Should retry up to 3 times max

## Code Changes Summary

- 7 Gather endpoints: Removed unconditional fallback redirects
- `/gather-previous-scenario`: Added state cleanup for retry count
- 5 Process handlers: Added timeout and confidence checks at beginning
- All process handlers now handle edge cases explicitly

No breaking changes to call flow logic or instruction system.
