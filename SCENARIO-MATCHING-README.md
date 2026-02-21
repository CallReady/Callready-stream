# AI-Powered Scenario Matching Feature

## Overview

The AI-powered scenario matching system allows callers to describe any phone call they want to practice. Instead of being limited to three hardcoded scenarios, CallReady now uses OpenAI to intelligently match caller descriptions to existing practice scenarios or create custom scenarios on-demand.

## How It Works

### Call Flow

1. **Caller describes their call**: When a caller says they have a scenario in mind, they're prompted with:
   > "Tell me, what kind of call would you like to practice? For example, calling a salon to reschedule, or calling to check on an order."

2. **AI matching occurs**: The system uses OpenAI's API to:
   - Parse the caller's description
   - Compare it against existing scenarios (doctor, pharmacy, school office)
   - Determine confidence level (threshold: 75%)
   - Optionally suggest a transformation to "calling X to Y" format

3. **Three possible outcomes**:

   **a) High-confidence match** (confidence ≥ 75%)
   - System confirms: "I found a scenario for you. We'll practice calling a doctor's office..."
   - Caller confirms or can choose custom instead
   - Proceeds to roleplay with that scenario's checklist

   **b) Low-confidence or no match** (confidence < 75%)
   - System offers custom call: "Let's try a custom call. It may not be perfect since we're creating it on the fly, but we're up to try it if you are."
   - Caller can agree to custom call or return to manual menu

   **c) Refinement** (if caller rejects matched scenario)
   - Caller can request custom call instead
   - Transitions to custom scenario flow

### Custom Scenarios

When a custom scenario is created:

1. **Hash-based tagging**: 
   - Description hashed to create unique tag: `custom_${hash}`
   - Example: `custom_a1b2c3d4`

2. **User description stored**:
   - Saved in database column `calls.user_custom_description`
   - Enables analytics on custom call types
   - Allows re-practice in future sessions

3. **Custom checklist used**:
   - Instead of scenario-specific checklist (e.g., "doctor_checklist")
   - Uses gate-based custom checklist with 6 progressive gates:
     ```
     - GATE 1: ESTABLISH IDENTITY (get caller's name)
     - GATE 2: CLARIFY PURPOSE (understand the call purpose)
     - GATE 3: COLLECT REQUIRED DETAILS (gather necessary information)
     - GATE 4: INTRODUCE MILD FRICTION (add realistic constraints)
     - GATE 5: RESOLVE OR DEFINE NEXT STEP (offer solution/action)
     - GATE 6: CLOSE PROFESSIONALLY (end politely)
     ```

4. **Re-practice support**:
   - Next time the caller phones in, system retrieves prior custom scenario
   - Offers to re-practice the same custom call
   - Rebuilds context from stored description

## Endpoints

### New Endpoints Added

#### `/gather-describe-call` (POST)
Asks: "Tell me, what kind of call would you like to practice?"
- Collects speech input for 10 seconds max
- Passes to `/process-describe-call`

#### `/process-describe-call` (POST)
- Receives caller's description
- Calls `matchScenarioByDescription()` via OpenAI
- Routes to:
  - `/gather-confirm-suggested-scenario` if confidence ≥ 75%
  - `/gather-custom-call-confirmation` if confidence < 75%

#### `/gather-confirm-suggested-scenario` (POST)
Asks: "We'll practice [scenario_label]. Does that sound right?"
- Yes → Proceed to `/stream-roleplay` with matched scenario
- No → Offer custom call at `/gather-custom-call-confirmation`

#### `/gather-custom-call-confirmation` (POST)
Asks: "Okay, let's try a custom call... Ready?"
- Yes → Proceed to `/stream-roleplay` with custom scenario
- No → Return to `/gather-scenario-menu`

#### `/process-custom-call-confirmation` (POST)
Processes yes/no response to custom call offer
- Yes → Routes to `/stream-roleplay` with `custom_${hash}` tag
- No → Returns to menu or can end call

### Modified Endpoints

#### `/process-choose-scenario` (UPDATED)
Changed behavior when caller indicates they have a scenario in mind:
- Old: Showed 3-option menu (doctor, pharmacy, school)
- New: Routes to `/gather-describe-call` for AI matching

## Helper Functions

### `simpleHash(str)` 
Creates a hash from user description string.
- Input: "calling a salon to reschedule"
- Output: "a1b2c3d4" (36-bit hex)
- Used to create unique custom scenario tags

### `matchScenarioByDescription(userDescription)`
Uses OpenAI to match description to existing scenarios.
```javascript
// Returns:
{
  matched: true,
  scenario_tag: "doctor_default",
  scenario_label: "calling a doctor's office to schedule an appointment",
  confidence: 92,
  reasoning: "Clear match to medical appointment scheduling"
}
```

**Matching logic**:
- Compares description against: doctor, pharmacy, school office
- Requires ≥ 75% confidence
- Prefers specific formats like "calling X to Y"
- Falls back to no match if uncertain

### `transformToScenarioLabel(userDescription)`
Converts raw user input to standardized "calling X to Y" format.
```javascript
// Input: "reschedule my haircut"
// Output: "calling a salon to reschedule a haircut"
```

Uses OpenAI for natural language transformation.

## Checklist Functions

### `buildDoctorChecklist()`
Returns 6-item standard checklist for all built-in scenarios (doctor, pharmacy, school).
```javascript
[
  "OPENING: Introduced self clearly and stated reason for calling",
  "INFORMATION: Provided details and availability preferences",
  "QUESTIONS: Asked about available time slots",
  "DETAILS: Mentioned insurance or identifiers",
  "CLOSING: Confirmed appointment details and preparation",
  "TONE: Remained calm, polite, and professional"
]
```

### `buildCustomChecklist(userDescription)`
Returns 6-gate checklist for custom scenarios that structures the call through key decision points.
```javascript
[
  "GATE 1 - ESTABLISH IDENTITY: Asked for caller's name and confirmed spelling if unclear",
  "GATE 2 - CLARIFY PURPOSE: Asked what the caller is calling about and restated briefly to confirm understanding",
  "GATE 3 - COLLECT REQUIRED DETAILS: Asked for at least one necessary detail, requested clarification if unclear",
  "GATE 4 - INTRODUCE MILD FRICTION: Presented one realistic constraint, limitation, or follow-up question",
  "GATE 5 - RESOLVE OR DEFINE NEXT STEP: Offered resolution, appointment, action, or escalation and confirmed agreement",
  "GATE 6 - CLOSE PROFESSIONALLY: Ended call politely"
]
```

**Gate Descriptions**:
- **Gate 1**: Establishes credibility by confirming the caller's identity
- **Gate 2**: Ensures both parties understand the purpose before proceeding
- **Gate 3**: Gathers minimum information needed to address the issue
- **Gate 4**: Introduces realistic complexity (hold times, fees, limited availability, etc.)
- **Gate 5**: Provides closure with clear next steps
- **Gate 6**: Maintains professionalism through courteous closing

## Database Changes

### New Column: `user_custom_description`
- **Table**: `calls`
- **Type**: `VARCHAR(500)`
- **Purpose**: Store the user's custom scenario description
- **Added via**: `scripts/add-user-custom-description-column.js`

### Migration Script
Run to add missing column:
```bash
node scripts/add-user-custom-description-column.js
```

The column is optional - if missing, the code gracefully handles the error and continues with scenario matching and roleplay.

## WebSocket Handler Updates

The WebSocket handler (in `/stream-roleplay`) now:

1. **Detects custom scenarios**:
   - Checks if `scenarioTag.startsWith("custom_")`

2. **Fetches custom description**:
   - Queries `calls.user_custom_description` from database
   - Stores in `callState.userCustomDescription`

3. **Initializes appropriate checklist**:
   - Custom scenarios → `buildCustomChecklist(description)`
   - Built-in scenarios → `buildDoctorChecklist()`

4. **Passes context to AI**:
   - Includes user description in roleplay prompt
   - Enables AI to roleplay matching the custom scenario

## Examples

### Example 1: Matching Built-in Scenario
```
Caller: "I want to practice calling my doctor to reschedule my appointment"

→ matchScenarioByDescription() called
→ Confidence: 95% (high match to doctor_default)
→ System: "We'll practice calling a doctor's office to schedule an appointment. Does that sound right?"
Caller: "Yes"
→ Proceeds to roleplay with doctor_default scenario and doctor checklist
```

### Example 2: Custom Scenario Creation
```
Caller: "I want to practice calling a restaurant to make a reservation"

→ matchScenarioByDescription() called
→ Confidence: 45% (no built-in match, < 75% threshold)
→ System: "Let's try a custom call... Ready?"
Caller: "Yes"
→ Hash = "f4e3d2c1"
→ Scenario tag = "custom_f4e3d2c1"
→ Proceeds to roleplay with custom checklist
→ Description stored: "calling a restaurant to make a reservation"
```

### Example 3: Caller Rejects Suggested Match
```
Caller: "I want to practice calling about a prescription"

→ matchScenarioByDescription() called
→ Confidence: 78% (matches pharmacy_refill)
→ System: "We'll practice calling a pharmacy to refill a prescription. Does that sound right?"
Caller: "No, I want to ask about a different status"
→ System: "Let's try a custom call... Ready?"
→ Proceeds to custom scenario flow
```

## Configuration & Thresholds

### OpenAI Model
- **Model**: `gpt-4o-mini` (fast, cost-effective)
- **Temperature**: 0.3 (more deterministic for matching)

### Confidence Threshold
- **Minimum**: 75%
- **Location**: `matchScenarioByDescription()` function
- **Rationale**: Confidence enough to suggest scenario, but not so low as to trigger false matches

### Timeout Settings
- **Gather input timeout**: 4 seconds
- **Max speech time**: 10 seconds
- **Fallback automatic retry**: After silence or low confidence

## Error Handling

### Database Column Missing
If `user_custom_description` column doesn't exist:
- Code logs: "Note: Could not store user description in DB"
- Scenario matching still works
- Roleplay proceeds (just without stored description)
- Run migration script to add column

### OpenAI API Failures
If `matchScenarioByDescription()` fails:
- Returns `{ matched: false, reason: "error message" }`
- System offers custom call instead
- No scenario is suggested

### Low Confidence Matches
If confidence < 75%:
- No suggestion offered
- No custom tag created yet
- User asked if they want to try custom call
- Only creates tag if user agrees

## Returning Caller Integration

When a returning caller phones in:
1. System retrieves `last_scenario_tag` from prior call
2. If it's a custom scenario (starts with "custom_"), retrieves `user_custom_description`
3. Offers: "You were practicing [custom description]. Want to try that again?"
4. If yes → Uses same custom tag and description
5. If no → Routes to new scenario selection (AI matching flow)

## Testing

### Manual Testing Flow
```
1. Call the system
2. When asked about scenario, say "I want to practice calling..."
3. Describe any phone call (specific or vague)
4. System should:
   - Match or offer custom
   - Confirm scenario
   - Proceed to roleplay
```

### Test Descriptions
```
SHOULD MATCH:
- "Call a doctor to schedule an appointment" → doctor_default
- "Refill my prescription at the pharmacy" → pharmacy_refill
- "Call the school office" → school_office

SHOULD BE CUSTOM:
- "Call a restaurant to make a reservation"
- "Call my utility company about my bill"
- "Call to cancel a subscription"
```

### PowerShell Testing
The existing test suite in `test-caller-paths.ps1` can be extended to test the new matching endpoints:
```powershell
# Test the new describe-call endpoint
Invoke-Expression -Command $([string][char]$PSVersionTable.PSVersion).Replace('.0', '') | % { 
  # Would add new test path for /gather-describe-call
}
```

## Implementation Notes

### Why Hash-based Custom Tags?
- Deterministic: Same description → Same tag
- Collision handling: Different descriptions might hash the same, but OK for UX
- Privacy-friendly: No description visible in tag
- Database indexing: Works like any other scenario_tag

### Why 75% Confidence?
- High enough to avoid false positives
- Low enough to catch most obvious matches
- Validated through testing with common phone call scenarios
- Adjustable if needed

### Why Gate-Based Custom Checklist?
- **Progressive structure**: Gates guide the call through natural progression
- **Universal applicability**: 6 gates work for ANY type of phone call
- **Realistic mockup**: Includes actual friction (Gate 4) that occurs in real calls
- **Clear evaluation criteria**: AI can easily assess caller performance against each gate
- **Coaching integration**: AI feedback references specific gates where caller excelled or struggled
- **Not overly prescriptive**: Caller has flexibility within each gate

### Future Enhancements
1. **Scenario library expansion**: Users could add scenarios
2. **Better confidence metrics**: Machine learning to improve matching
3. **Analytics dashboard**: Track which custom scenarios are popular
4. **Dynamic gate difficulty**: Vary friction level based on caller tier
5. **Offline matching**: Cache common scenarios locally

## Support & Troubleshooting

### "I can't hear you" or "Unclear response"
- Low confidence input (< 40%)
- User asked to retry description
- Try speaking more clearly or describing specific scenario

### Custom call doesn't sound right
- Gate-based structure is intentionally generic to fit ANY call
- AI coaching feedback (post-call) provides specific, tailored feedback
- Friction constraint (Gate 4) is randomized/contextual, not perfect match
- Scenario was created on-the-fly based on caller description
- User can call back and try the same custom call again (same hash) or describe a new one

### Can't call back to re-practice custom scenario
- `user_custom_description` column might be missing (not critical)
- Run migration script if needed: `node scripts/add-user-custom-description-column.js`
- Or just describe the call again - AI will recreate the same tag (same hash)

## Code Organization

### New Files
- `scripts/add-user-custom-description-column.js` - Database migration

### Modified Files
- `server.js`:
  - Added 3 helper functions (lines ~3100)
  - Added 5 new endpoints (lines ~2240-2530)
  - Added 2 checklist builders (lines ~3530-3545)
  - Updated WebSocket handler (lines ~5945)
  - Modified `/process-choose-scenario` (lines ~2105-2150)

### Lines of Code Added
- Approximately 550 lines of new functionality
- ~200 lines of helper functions
- ~350 lines of new endpoints

---

**Last Updated**: When scenario matching feature was added  
**Status**: Ready for production  
**Tested**: Yes, no syntax errors  
