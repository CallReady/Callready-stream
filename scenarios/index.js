// Scenario Registry - loads scenario configurations at boot
// Each scenario is a config object with deterministic prompt structure

const doctorDefault = require('./doctor_default');
const pizzaOrder = require('./pizza_order');
const dentistAppointment = require('./dentist_appointment');

// Build SCENARIO_REGISTRY
const SCENARIO_REGISTRY = {
  doctor_default: doctorDefault,
  pizza_order: pizzaOrder,
  dentist_appointment: dentistAppointment
};

module.exports = SCENARIO_REGISTRY;
