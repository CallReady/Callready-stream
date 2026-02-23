module.exports = {
  tag: "pizza_order",
  displayName: "Order a pizza",
  practiceLabel: "calling a pizza place to order pizza",
  answererRole: "counter staff at Coastline Pizza",
  goalStatement: "Collect the order details and place a pizza order for pickup or delivery.",

  slots: [
    "call_purpose",
    "customer_name",
    "phone_number",
    "pickup_or_delivery",
    "delivery_address",
    "pizza_size",
    "crust_type",
    "sauce_choice",
    "toppings",
    "sides_and_drinks",
    "payment_method",
    "timing_preference",
    "order_confirmation_and_closing"
  ],

  questions: {
    call_purpose: {
      baseQuestion: "Thanks for calling Coastline Pizza. What can I help you with today?",
      helpIfStuck: "If unclear, try: 'Are you calling to place an order for pickup or delivery?'"
    },

    customer_name: {
      baseQuestion: "Can I get a name for the order?",
      helpIfStuck: "If unclear, ask them to spell it."
    },

    phone_number: {
      baseQuestion: "What’s a good phone number for the order?",
      helpIfStuck: "If they hesitate, say it’s in case we need to confirm anything."
    },

    pickup_or_delivery: {
      baseQuestion: "Is this for pickup or delivery?",
      helpIfStuck: "If unsure, briefly explain: pickup is usually faster, delivery takes a bit longer."
    },

    delivery_address: {
      baseQuestion: "What’s the delivery address?",
      helpIfStuck: "If they start with just a street name, ask for street number, apartment number if needed, and city."
    },

    pizza_size: {
      baseQuestion: "What size pizza would you like, small, medium, or large?",
      helpIfStuck: "If they are unsure, offer a quick guide: medium for 2 people, large for 3 to 4."
    },

    crust_type: {
      baseQuestion: "What kind of crust would you like, thin, regular, or deep dish?",
      helpIfStuck: "If they are unsure, suggest regular as the standard option."
    },

    sauce_choice: {
      baseQuestion: "What sauce would you like, classic red, white sauce, or no sauce?",
      helpIfStuck: "If they say 'regular', treat it as classic red and confirm briefly."
    },

    toppings: {
      baseQuestion: "What toppings would you like on that pizza?",
      helpIfStuck: "If they struggle, offer a few common options like pepperoni, sausage, mushrooms, and olives."
    },

    sides_and_drinks: {
      baseQuestion: "Would you like any sides or drinks with your order?",
      helpIfStuck: "If they are unsure, offer examples like breadsticks, wings, salad, or soda."
    },

    payment_method: {
      baseQuestion: "How would you like to pay, card or cash?",
      helpIfStuck: "If delivery, ask if they’ll be paying at the door or over the phone."
    },

    timing_preference: {
      baseQuestion: "When would you like that, as soon as possible, or a specific time?",
      helpIfStuck: "If they pick a specific time, repeat it back to confirm."
    },

    order_confirmation_and_closing: {
      baseQuestion: "All right, let me read that back to make sure I’ve got it right. Does everything sound correct?",
      helpIfStuck: "If they change something, update it naturally, then confirm again and close with a friendly goodbye."
    }
  },

  completion: {
    mode: "all_required_slots_complete"
  }
};