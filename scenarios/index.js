// Scenario Registry - loads scenario configurations at boot
// Each scenario is a config object with deterministic prompt structure

const doctorDefault = require('./doctor_default');
const pizzaOrder = require('./pizza_order');
const dentistAppointment = require('./dentist_appointment');
const appointmentCancellation = require('./appointment_cancellation');

// Build SCENARIO_REGISTRY
const SCENARIO_REGISTRY = {
  doctor_default: doctorDefault,
  pizza_order: pizzaOrder,
  dentist_appointment: dentistAppointment,
  appointment_cancellation: appointmentCancellation
};

module.exports = SCENARIO_REGISTRY;
