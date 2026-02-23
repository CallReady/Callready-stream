module.exports = {
    tag: "pizza_order",
    displayName: "Order a pizza",
    practiceLabel: "calling a pizza place to order pizza",
    answererRole: "busy counter staff at Coastline Pizza",
    goalStatement: "Quickly take a pizza order, handle multiple pizzas if needed, and give the total and pickup or delivery time.",

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
        "pickup_or_delivery",
        "delivery_address",
        "number_of_pizzas",
        "pizza_details",
        "sides_and_drinks",
        "order_total_and_eta",
        "payment_method",
        "timing_preference",
        "order_confirmation_and_closing"
    ],

    questions: {
        call_purpose: {
            baseQuestion: "Coastline Pizza, what can I get started for you?",
            helpIfStuck: "If unclear, try: 'You placing an order for pickup or delivery?'"
        },

        customer_name: {
            baseQuestion: "Name for the order?",
            helpIfStuck: "If unclear, ask them to tell their full name for the order."
        },

        phone_number: {
            baseQuestion: "Best phone number in case we get cut off?",
            helpIfStuck: "If they hesitate, explain it's just in case there’s an issue."
        },

        pickup_or_delivery: {
            baseQuestion: "Pickup or delivery?",
            helpIfStuck: "If unsure, say pickup is about 20 minutes, delivery usually 35 to 45."
        },

        delivery_address: {
            baseQuestion: "What’s the address?",
            helpIfStuck: "Ask for street number, apartment number if needed, and city."
        },

        number_of_pizzas: {
            baseQuestion: "How many pizzas are we doing?",
            helpIfStuck: "If they hesitate, clarify: 'Just one, or more than one?'"
        },

        pizza_details: {
            baseQuestion: "All right, let’s go one at a time. Size, crust, and toppings for the first one?",
            helpIfStuck: "If they are overwhelmed, guide them step by step: size first, then crust, then toppings. If multiple pizzas, ask for details for each and summarize."
        },

        sides_and_drinks: {
            baseQuestion: "Anything else? Breadsticks, wings, drinks?",
            helpIfStuck: "If they ask for something else, say: 'Sorry, we only do pizza, breadsticks, wings, and drinks.' Then ask if they want any of those."
        },

        order_total_and_eta: {
            baseQuestion: "Okay, your total comes to 43 dollars. Does that work for you?",
            helpIfStuck: "If they question the price, briefly explain it depends on size and toppings, then restate the total and time."
        },

        payment_method: {
            baseQuestion: "You paying cash or card?",
            helpIfStuck: "If delivery, clarify if card now or at the door."
        },

        timing_preference: {
            baseQuestion: "You want that as soon as it’s ready, or you need it later?",
            helpIfStuck: "If specific time given, repeat it back to confirm."
        },

        order_confirmation_and_closing: {
            baseQuestion: "All right, we’ve got it in. We’ll see you soon. Anything else before I let you go?",
            helpIfStuck: "If they make changes, update naturally, restate the total and time, then close casually."
        }
    },

    completion: {
        mode: "all_required_slots_complete"
    }
};