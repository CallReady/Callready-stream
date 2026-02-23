# Pizza Order Scenario - Coaching Transition Fixes

## Problem
Pizza order calls were not advancing to coaching phase when checklist was complete. The call would loop on questions indefinitely instead of transitioning.

## Root Causes Identified

### Issue 1: Completion Check Only for Specific Scenarios
The completion detection logic was nested inside a condition that only ran for `doctor_default` and `custom_` scenarios:
```javascript
if (callState.scenarioTag === "doctor_default" || callState.scenarioTag.startsWith("custom_")) {
  // completion check code only here
}
```
This meant pizza_order completions were never detected.

**Fix:** Moved completion check outside scenario-specific block (lines 6775-6842) to run for ALL scenarios with checklists.

### Issue 2: Tool-Only Guard Creating Duplicate Response
Even when completion was checked, a race condition existed:
1. AI calls `mark_checklist_item_complete()` for final item → function handler marks item done
2. Tool-only guard sees no audio in response, creates another `response.create`
3. Completion check runs, tries to transition to coaching
4. But Twilio already expects a followup response, causing timing issues

**Fix:** Reordered execution so completion check runs BEFORE the tool-only guard:
- If completion detected → transition to coaching and return immediately
- If not complete → tool-only guard can create followup response
- This prevents duplicate responses when checklist is complete

## Changes Made

### server.js Line 6775-6842
- Moved completion check block to run immediately after function call processing
- Now checks for all scenarios, not just doctor_default/custom_
- Logs detailed checklist status (all items, done items, remaining items)
- Automatically transitions to coaching when all required items are done
- Returns immediately to prevent further processing once transition starts

### server.js Line 6844-6858
- Tool-only guard now runs AFTER completion check
- Only creates followup response if still in roleplay phase
- Won't interfere with coaching transition

### Diagnostic Logging Added
Enhanced logging to help debug config-driven mode activation (lines 4697-4709):
- Logs scenario resolution status
- Logs getNextTurnSpec result and config-driven mode activation
- Logs fallback mode activation reason

Enhanced logging for checklist operations:
- Function call logging shows progress (e.g., "3/12" items done)
- Detailed checklist summary in completion check
- Coaching transition logging with scenario and item count
- Warning when field_id not found in checklist

## Expected Behavior After Fix

For pizza_order scenario:
1. AI asks questions using config-driven mode
2. AI calls `mark_checklist_item_complete()` for each collected field
3. When final item (order_confirmation_and_closing) is marked complete
4. Completion check detects all 12 required items are done
5. Automatically transitions to coaching phase
6. Twilio redirects to `/gather-coaching-feedback` endpoint
7. User gets coaching feedback on their performance

## Verification Steps

Test a pizza_order call:
1. Verify instructions have config-driven format (1500+ chars mention CONSTRAINT, etc.)
2. Watch logs for `[CONFIG_DRIVEN_ACTIVATED]` message
3. Watch logs for all 12 items being marked complete
4. Watch for `[COACHING_TRANSITION]` message after final item
5. Call should redirect to coaching instead of looping

## Code Changes Summary

- Moved ~100 lines of completion logic higher in response.done handler
- Reordered guards so completion check runs before tool-only guard
- Added detailed diagnostic logging throughout
- Now supports all scenarios with checklists, not just hardcoded doctor_default
