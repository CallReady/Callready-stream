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
        "questions"
    ],

    questions: {
        call_purpose: {
            baseQuestion: "Coastline Pizza, how can I help you?",
            waitForResponse: true,
            validation: {
                requirement: "confirmation that they want to place a pizza order"
            },
            helpIfStuck: "If they don't clearly indicate they're ordering, ask: 'Are you calling to place an order?'"
        },

        customer_name: {
            baseQuestion: "Name for the order?",
            waitForResponse: true,
            validation: {
                requirement: "a name to put the order under"
            },
            helpIfStuck: "If unclear, ask them to tell their full name for the order."
        },

        phone_number: {
            baseQuestion: "Best phone number in case we get cut off?",
            waitForResponse: true,
            validation: {
                requirement: "a complete phone number with area code (at least 10 digits)"
            },
            helpIfStuck: "If they hesitate, explain it's just in case there's an issue."
        },

        delivery_address: {
            baseQuestion: "What's the delivery address?",
            waitForResponse: true,
            validation: {
                requirement: "a complete street address with number and street name"
            },
            helpIfStuck: "Ask for street number and apartment number if needed."
        },

        number_of_pizzas: {
            baseQuestion: "How many pizzas are we doing?",
            waitForResponse: true,
            validation: {
                requirement: "a number representing how many pizzas (e.g., 1, 2, 3)"
            },
            helpIfStuck: "If they hesitate, clarify: 'Just one, or more than one?'"
        },

        pizza_details: {
            baseQuestion: "For the pizza—what size do you want, and what toppings?",
            waitForResponse: true,
            validation: {
                requirement: "size choice (small, medium, or large) and at least one topping for each pizza"
            },
            helpIfStuck: "If multiple pizzas, get size and toppings for each one. If they're overwhelmed, ask size first, then toppings. Summarize the full order before moving on."
        },

        sides_and_drinks: {
            baseQuestion: "Anything else? Breadsticks, wings, drinks?",
            waitForResponse: true,
            validation: {
                requirement: "either a list of sides/drinks they want, or confirmation they don't want any extras"
            },
            helpIfStuck: "If they ask for something else, say: 'Sorry, we only do pizza, breadsticks, wings, and drinks.' Then ask if they want any of those."
        },

        payment_method: {
            baseQuestion: "Will you be paying with cash or card?",
            waitForResponse: true,
            validation: {
                requirement: "either 'cash' or 'card' as the payment method"
            },
            helpIfStuck: "If card, clarify: 'Card now or will you pay at the door?'"
        },

        timing_preference: {
            baseQuestion: "Do you need it as soon as it's ready, or at a specific time?",
            waitForResponse: true,
            validation: {
                requirement: "either as soon as possible, 'asap', or a specific time they want the order"
            },
            helpIfStuck: "If they give a specific time, repeat it back to confirm."
        },

        order_total: {
            baseQuestion: "Your total is $45.99, and delivery's about 40 minutes. Does that work?",
            waitForResponse: true,
            validation: {
                requirement: "caller confirmation that they accept the total price and estimated delivery time"
            },
            helpIfStuck: "State the total and time clearly. Do NOT ask the caller to calculate it. If they question, briefly explain what's included."
        },

        questions: {
            baseQuestion: "Do you have any questions?",
            waitForResponse: true,
            loopUntilDone: true,
            validation: {
                requirement: "confirmation of no further questions"
            },
            helpIfStuck: "It's okay if you don't."
        }
    },

    closingMessage: "Perfect! Thanks for ordering from Coastline Pizza.",

    completion: {
        mode: "all_required_slots_complete"
    }
};