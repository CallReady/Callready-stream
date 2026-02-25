# Scenario Migration Guide: Legacy → Flexible Mode

This guide helps scenario authors migrate existing scenarios from **legacy mode** (fixed question sequences) to **flexible mode** (dynamic, AI-guided conversations).

---

## Quick Status Check

Use the logs to see which mode your scenario is using:

```
[ROLEPLAY_MODE] tag=doctor_default mode=flex
[ROLEPLAY_MODE] tag=pizza_order mode=legacy
```

During scenario load, you'll see validation warnings if migration is incomplete:

```
[MIGRATION_WARNING] Scenario "my_scenario" is marked roleplayMode=flex but has no slotSpecs.
[MIGRATION_SUGGESTION] Scenario "my_scenario" has questions but no slotSpecs.
```

---

## Why Migrate?

**Legacy Mode (Current Default)**
- AI asks prepared questions in fixed order
- Limited flexibility - all callers follow same path
- No gating or prioritization of questions
- Questions defined by `questions` object with `baseQuestion`

**Flexible Mode (Recommended)**
- AI naturally gathers information based on conversation flow
- Adapts to caller's context and previous answers
- Supports gating (blocking questions) and priority ordering
- Info structure defined by `slotSpecs` object

---

## 5-Step Migration Checklist

### Step 1: Add `roleplayMode: "flex"`

Add this at the top level of your scenario module:

```javascript
module.exports = {
  tag: "my_scenario",
  displayName: "My Scenario",
  // ... other fields ...
  
  roleplayMode: "flex",  // ← Add this line
  
  slotSpecs: {
    // ... define below ...
  }
};
```

**Why:** Tells the server to use flexible mode for this scenario. Without this, the server will default based on presence of `slotSpecs`.

---

### Step 2: Define `slotSpecs` Object

Each slot needs a `slotSpec` object with these **required** fields:

```javascript
slotSpecs: {
  call_purpose: {
    // REQUIRED: Brief intent for AI guidance
    promptIntent: "Confirm the caller's reason for calling",
    
    // REQUIRED: What valid input looks like (for AI validation)
    requirement: "confirmation that they want to schedule an appointment",
    
    // OPTIONAL: Help text if AI gets stuck
    repromptHelp: "Try asking: 'Are you calling to schedule an appointment?'",
    
    // OPTIONAL: Block other questions until this is answered
    gating: true,  // default: false
    
    // OPTIONAL: Order priority (1-100, lower = asked earlier)
    priority: 1    // default: 100
  }
  
  // Add slotSpecs for every slot...
}
```

**Copy from existing questions:**

If you already have a `questions` object, extract info from each entry:

```javascript
// OLD (questions object):
questions: {
  call_purpose: {
    baseQuestion: "Are you calling to schedule an appointment?",
    validation: {
      requirement: "confirmation that they want to schedule"
    },
    helpIfStuck: "Clarify if needed."
  }
}

// NEW (slotSpecs):
slotSpecs: {
  call_purpose: {
    promptIntent: "Confirm the caller wants to schedule an appointment",
    requirement: "confirmation that they want to schedule",
    repromptHelp: "Clarify if needed."
  }
}
```

---

### Step 3: Copy All Slots into `slotSpecs`

Ensure every slot in your `slots` array has a matching `slotSpec`:

```javascript
slots: [
  "call_purpose",
  "customer_name",
  "phone_number",
  // ... more slots
],

slotSpecs: {
  call_purpose: { /* ... */ },
  customer_name: { /* ... */ },
  phone_number: { /* ... */ },
  // MUST have _every_ slot here
}
```

**Check:** All slots in the `slots` array must have entries in `slotSpecs`.

---

### Step 4: Optional - Add Gating and Priority

Once slotSpecs are defined, enhance the flow with gating and priority:

**Gating** - Lock later questions until an earlier one is answered:

```javascript
call_purpose: {
  // ...
  gating: true  // Other questions won't be asked until this is answered
}
```

**Priority** - Control the order AI asks questions (lower number = asked earlier):

```javascript
call_purpose: {
  // ...
  priority: 1   // Ask first
},

customer_name: {
  // ...
  priority: 2   // Ask second
},

phone_number: {
  // ...
  priority: 100 // Ask later (default)
}
```

---

### Step 5: Validate and Test

Run the scenario and watch for:

**Good signs:**
```
[ROLEPLAY_MODE] tag=my_scenario mode=flex
```

**Warning signs:**
```
[MIGRATION_WARNING] Scenario "my_scenario" is marked roleplayMode=flex but has no slotSpecs.
[MIGRATION_WARNING] Scenario "my_scenario", slot "call_purpose": Missing promptIntent.
[MIGRATION_WARNING] Scenario "my_scenario", slot "customer_name": Missing requirement.
```

Fix warnings before production deployment.

---

## Rollback Instructions

If flexible mode doesn't work for your scenario, you can quickly revert:

**Option 1: Change `roleplayMode` back to legacy**

```javascript
roleplayMode: "legacy"  // ← Change from "flex"
```

No other changes needed. The scenario will use the `questions` object and revert to fixed-order asking.

**Option 2: Remove `slotSpecs` entirely**

Delete the entire `slotSpecs` object. The scenario will auto-detect as legacy based on presence of `questions`.

**Option 3: Set environment override (for testing)**

```bash
export ROLEPLAY_MODE_FORCE=legacy  # Force all scenarios to legacy mode
export ROLEPLAY_MODE_FORCE=flex    # Force all scenarios to flex mode
```

This overrides all scenario settings and is useful for debugging.

---

## ValidatorHint Types

Optional field in slotSpecs for custom validation rules:

```javascript
call_purpose: {
  // ...
  validatorHint: {
    type: "all_of",  // Require ALL rules to pass
    rules: [
      { type: "min_words", minWords: 3 },
      { type: "keywords_any", keywords: ["appointment", "schedule"], minMatches: 1 }
    ]
  }
}
```

### Available Validator Types

| Type | Purpose | Example |
|------|---------|---------|
| `min_words` | Enforce minimum word count | `{ type: "min_words", minWords: 3 }` |
| `keywords_any` | Require ANY of specified keywords | `{ type: "keywords_any", keywords: ["yes", "okay"], minMatches: 1 }` |
| `keywords_all` | Require ALL specified keywords | `{ type: "keywords_all", keywords: ["confirm", "appointment"] }` |
| `phone_format` | Validate phone number | `{ type: "phone_format" }` |
| `email_format` | Validate email address | `{ type: "email_format" }` |
| `one_of` | Require response matches options | `{ type: "one_of", options: ["cash", "card"] }` |
| `number_range` | Validate number in range | `{ type: "number_range", min: 1, max: 10 }` |

### Combining Multiple Rules

Use `all_of` to require multiple validations:

```javascript
phone_number: {
  promptIntent: "Collect phone number",
  requirement: "a 10-digit phone number",
  validatorHint: {
    type: "all_of",
    rules: [
      { type: "min_words", minWords: 1 },
      { type: "phone_format" }
    ]
  }
}
```

---

## Gating and Priority Deep Dive

### Gating: Blocking Questions

Gating creates prerequisites - questions won't be asked until a gated question is answered:

```javascript
slotSpecs: {
  call_purpose: {
    // ...
    gating: true  // ← No other questions until this is answered
  },
  
  customer_name: {
    // ... This won't be asked until call_purpose is done
    gating: false  // ← Can be asked normally
  }
}
```

**Use gating for:**
- Required first questions (like confirming intent)
- Branching logic (only relevant if previous answer matched)
- Gatekeeping (can't proceed without this info)

### Priority: Controlling Order

Priority number (1-100) controls when AI suggests asking each question:

```javascript
slotSpecs: {
  call_purpose: {
    priority: 1    // ← Ask first
  },
  customer_name: {
    priority: 2    // ← Ask second
  },
  phone_number: {
    priority: 50   // ← Ask much later
  },
  order_total: {
    priority: 100  // ← Ask at the end (default)
  }
}
```

**Algorithm:**
1. Questions are sorted by priority (ascending)
2. Gated questions are only considered if their gate is satisfied
3. AI naturally asks highest-priority remaining questions
4. Caller context determines exact order (AI adapts)

**Priority recommendations:**
- Critical entry questions (confirm intent): 1-10
- Required personal info (name, contact): 10-30
- Order/transaction details: 30-70
- Closing questions (total, final questions): 80-100

---

## Migration Examples

### Minimal Migration (Just Add Flex Mode)

```javascript
// Add ONE line, keep everything else:
module.exports = {
  tag: "my_scenario",
  // ... existing fields stay ...
  
  roleplayMode: "flex",  // ← Add this
  
  // Keep existing slotSpecs if already present
  // Or system will auto-convert from questions
}
```

### Full Migration (Clean SlotSpecs)

```javascript
module.exports = {
  tag: "my_scenario",
  displayName: "My Scenario",
  validation: { mode: "trust_ai" },
  
  roleplayMode: "flex",
  
  slotSpecs: {
    call_purpose: {
      promptIntent: "Confirm the caller's intent",
      requirement: "clear confirmation of what they want",
      gating: true,
      priority: 1
    },
    // ... more slots ...
  },
  
  slots: ["call_purpose", /* ... */],
  
  // Keep questions object for backward compatibility
  // (not used in flex mode, but safe to keep)
  questions: {
    // ... existing questions ...
  }
}
```

---

## Troubleshooting Migration Issues

### Issue: "Missing promptIntent" Warning

**Cause:** SlotSpec doesn't have `promptIntent` field.

**Fix:**
```javascript
// BEFORE
call_purpose: {
  requirement: "confirmation"
}

// AFTER
call_purpose: {
  promptIntent: "Confirm why they're calling",  // ← Add this
  requirement: "confirmation"
}
```

---

### Issue: "Missing requirement" Warning

**Cause:** SlotSpec doesn't define what valid input looks like.

**Fix:**
```javascript
// BEFORE
customer_name: {
  promptIntent: "Get the customer's name"
}

// AFTER
customer_name: {
  promptIntent: "Get the customer's name",
  requirement: "a customer name (first and/or last)"  // ← Add this
}
```

---

### Issue: Scenario Stuck in Legacy Mode

**Cause:** Either `roleplayMode` is set to "legacy", or no `slotSpecs` are defined.

**Fix:**
```javascript
// Check 1: Is roleplayMode explicitly set to legacy?
roleplayMode: "legacy"  // ← Remove or change to "flex"

// Check 2: Are slotSpecs defined?
slotSpecs: {
  // Must have entries for flex mode
}
```

---

### Issue: Questions Asked in Wrong Order

**Cause:** Priority values are incorrect or reversed.

**Fix:**
```javascript
// WRONG: Lower priority asked later
call_purpose: { priority: 100 },
customer_name: { priority: 1 }  // ← Wrong!

// RIGHT: Lower priority asked earlier
call_purpose: { priority: 1 },
customer_name: { priority: 2 }  // ← Correct
```

---

## Auto-Conversion Behavior

If you don't manually define `slotSpecs`, the system will **automatically convert** from your `questions` object:

```javascript
// Input: Only questions object
{
  slots: ["call_purpose", "customer_name"],
  questions: {
    call_purpose: {
      baseQuestion: "Are you calling to schedule?",
      validation: { requirement: "confirmation" }
    },
    customer_name: {
      baseQuestion: "Name for the order?",
      validation: { requirement: "a customer name" }
    }
  }
}

// Auto-converted to:
{
  roleplayMode: "flex",  // ← Inferred from questions present
  slotSpecs: {
    call_purpose: {
      promptIntent: "Collect call purpose",  // ← Auto-generated
      requirement: "confirmation",
      gating: false,
      priority: 100
    },
    customer_name: {
      promptIntent: "Collect customer name",  // ← Auto-generated
      requirement: "a customer name",
      gating: false,
      priority: 100
    }
  }
}
```

**What auto-conversion provides:**
- ✅ Slots are gathered (any order)
- ✅ Requirements are preserved from questions
- ✅ Help text is converted if present

**What auto-conversion lacks:**
- ❌ Custom priority ordering (all slots = priority 100)
- ❌ Gating (no dependencies between questions)
- ❌ Custom promptIntent phrasing

**Recommendation:** Even if auto-conversion works, add explicit `slotSpecs` for:
- Better AI guidance via clear `promptIntent`
- Proper question ordering via `priority`
- Question gating via `gating: true`

---

## Deployment Checklist

Before deploying a migrated scenario:

- [ ] `roleplayMode: "flex"` is set
- [ ] All slots have `slotSpecs` entries
- [ ] Each slotSpec has `promptIntent` and `requirement`
- [ ] No `[MIGRATION_WARNING]` logs appear on load
- [ ] Tested in flex mode and verified conversation flow
- [ ] Rollback plan is documented (change `roleplayMode` to "legacy")
- [ ] If using gating/priority, tested that they work as expected
- [ ] Questions object is cleaned up or left as backward-compatible reference

---

## Support & Examples

For working examples see:

- [doctor_default.js](../scenarios/doctor_default.js) - Complete flex migration with gating and priority
- [pizza_order.js](../scenarios/pizza_order.js) - Simple flex migration, all slots at equal priority
- [ROLEPLAY-PHASE-ARCHITECTURE.md](./ROLEPLAY-PHASE-ARCHITECTURE.md) - Full technical reference

### Getting Help

Check the logs for your specific issue:

```bash
# Filter for a specific scenario
grep "my_scenario" server.log | grep MIGRATION

# Filter for all migration issues
grep MIGRATION server.log
```

---

## Version History

- **Phase 3.0** (Current) - Initial flexible mode with roleplayMode field, validateScenarioConfig, ROLEPLAY_MODE_FORCE env var
- **Phase 2.0** - Deterministic closing gate
- **Phase 1.0** - Flexible slot ordering

