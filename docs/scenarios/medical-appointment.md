Medical Appointment Scheduling Scenario Contract

Scenario
- User is calling a doctor’s office to schedule an appointment.
- AI plays the receptionist.
- User plays the patient.

Global rules
- Unknown inputs never advance a gate, they trigger a reprompt in the same gate.
- After 2 unclear attempts, reprompt in simplified form.
- After 3 failed attempts, choose a default and announce it out loud.
- Reroute triggers are always respected immediately:
  - change scenario, route to Scenario Gate
  - change call type, route to Call Direction Gate
  - start over, route to Call Direction Gate
  - I’m confused, repeat role and purpose, then resume current gate
  - stop, end practice, end phrase, route to Closing Gate

Gate: Call direction
Required outcome
- callType = outgoing
- user role = caller
- AI role = receptionist

Valid labels
- outgoing
- incoming

Retries
- Reprompt once conversationally
- Reprompt once simplified
- Then default to outgoing and announce

Default announcement
- “I’ll start with you calling the office. You can change that anytime.”

Gate: Scenario selection
Required outcome
- scenarioTag = medical_schedule

Valid labels
- medical appointment
- doctor appointment
- schedule appointment
- doctor

Invalid
- yes
- no
- anything else

Retries
- Reprompt with explicit options
- Reprompt simplified: “Say medical appointment to continue.”
- Then default to medical_schedule and announce

Default announcement
- “I’ll start with scheduling a medical appointment. You can switch anytime by saying change scenario.”

Gate: Role and purpose confirmation
Server sets
- Purpose: schedule appointment
- AI role: receptionist
- User role: patient

AI must say
- “You’re calling the front desk to schedule an appointment. I’ll answer as the receptionist after the ring.”

Twilio plays MP3
/audio-fixed/cellphonering.mp3

Advance
- Automatically after orientation line

Gate: Required slot collection
Required slots in order
- patient_status: new or existing
- full_name: not empty
- date_of_birth: must sound like a date
- reason_for_visit: short description
- availability_window: mornings, afternoons, or a specific day range

Rules
- Slots collected in order.
- Small talk allowed between slot questions.
- No appointment times offered until required slots complete.

DOB refusal handling
- Explain it is required to book.
- If still refused, allow discussion of general availability, but do not confirm a booking.

Gate: Offer appointment options
Rules
- Offer 2 to 3 realistic options.
- If rejected, loop in this gate and offer alternatives.
- Do not advance until user selects one option.

Gate: Confirmation
AI must restate
- Name
- Date of birth
- Appointment time
- Reason

Rules
- Must receive a clear confirmation.
- If correction requested, route back to the relevant gate.

Gate: Next steps
AI provides
- Arrival timing
- Insurance reminder
- Paperwork note

Rules
- Answer one brief clarifying question if asked, then proceed to close.

Gate: Close
AI closes professionally
- “Your appointment is set. We’ll see you then.”

Call ends cleanly.
