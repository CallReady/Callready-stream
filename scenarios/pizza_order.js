module.exports = {
    tag: "pizza_order",
    displayName: "Order a pizza",
    practiceLabel: "calling a pizza place to order a pizza to be delivered",
    answererRole: "busy counter staff at Coastline Pizza",
    goalStatement: "Quickly take a pizza order for delivery, handle multiple pizzas if needed, and confirm the total and delivery time.",

    pricing: {
        taxRate: 0.08,
        deliveryFee: 4.0,
        basePrices: {
            small: 12.0,
            medium: 15.0,
            large: 18.0
        },
        toppingPrice: 2.0,
        crustUpcharge: {
            thin: 0.0,
            regular: 0.0,
            deep_dish: 3.0
        },
        breadsticksPrice: 6.0,
        drinkPrice: 2.5,
        wingsPrice: 8.0
    },

    slots: [
        "call_purpose",
        "customer_name",
        "phone_number",
        "delivery_address",
        "number_of_pizzas",
        "pizza_details",
        "sides_and_drinks",
        "payment_method",
        "timing_preference",
        "order_total",
        "questions",
        "closing"
    ],

    questions: {
        call_purpose: {
            baseQuestion: "Coastline Pizza, how can I help you?",
            helpIfStuck: "If they don't clearly indicate they're ordering, ask: 'Are you calling to place an order?'"
        },

        customer_name: {
            baseQuestion: "Name for the order?",
            helpIfStuck: "If unclear, ask them to tell their full name for the order."
        },

        phone_number: {
            baseQuestion: "Best phone number in case we get cut off?",
            helpIfStuck: "If they hesitate, explain it's just in case there’s an issue."
        },

        delivery_address: {
            baseQuestion: "What's the delivery address?",
            helpIfStuck: "Ask for street number, apartment number if needed, and city."
        },

        number_of_pizzas: {
            baseQuestion: "How many pizzas are we doing?",
            helpIfStuck: "If they hesitate, clarify: 'Just one, or more than one?'"
        },

        pizza_details: {
            baseQuestion: "For the pizza—what size do you want, and what toppings?",
            helpIfStuck: "If multiple pizzas, get size and toppings for each one. If they're overwhelmed, ask size first, then toppings. Summarize the full order before moving on."
        },

        sides_and_drinks: {
            baseQuestion: "Anything else? Breadsticks, wings, drinks?",
            helpIfStuck: "If they ask for something else, say: 'Sorry, we only do pizza, breadsticks, wings, and drinks.' Then ask if they want any of those."
        },

        payment_method: {
            baseQuestion: "Will you be paying with cash or card?",
            helpIfStuck: "If card, clarify: 'Card now or will you pay at the door?'"
        },

        timing_preference: {
            baseQuestion: "Do you need it as soon as it's ready, or at a specific time?",
            helpIfStuck: "If they give a specific time, repeat it back to confirm."
        },

        order_total: {
            baseQuestion: "Your total is $45.99, and delivery's about 40 minutes. Does that work?",
            helpIfStuck: "State the total and time clearly. Do NOT ask the caller to calculate it. If they question, briefly explain what's included."
        },

        questions: {
            baseQuestion: "Do you have any questions?",
            helpIfStuck: "It's okay if you don't."
        },

        closing: {
            baseQuestion: "Perfect! Thanks for ordering from Coastline Pizza."
        }
    },

    completion: {
        mode: "all_required_slots_complete"
    }
};