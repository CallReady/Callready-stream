CallReady Working Call Flow Bible

Core principle
- The server owns the workflow.
- The AI performs within the workflow.
- Twilio carries audio and can stop the call at any time.

Non negotiable gates
- Session start and safety framing
- Choose call direction
- Choose scenario
- Role assignment and purpose
- Required slot collection
- Offer options
- Confirmation
- Next steps and close

Rules
- Unknown inputs never advance a phase, they trigger a reprompt in the same gate.
- Defaults are allowed only after retries and must be announced out loud.
- The AI may vary surface language, but cannot advance phases.
- The server is the only system allowed to advance phases.

Explicit reroute triggers
- change scenario, route to Scenario Gate
- change call type, route to Call Direction Gate
- start over, route to Call Direction Gate
- I’m confused, repeat role and purpose, then resume current gate
- stop, end practice, end phrase, route to Closing Gate

Tone vs structure
- Workflow checklist is rigid.
- Conversational tone is flexible.
- Brief reassurance is allowed, then return to the next required question.
