// src/modules/appointments/appointments.schema.js
const Joi = require('joi');

const apptStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'];
const apptTypes    = ['consultation', 'follow_up', 'emergency', 'checkup'];

const createAppointmentSchema = Joi.object({
  patient_id:      Joi.string().uuid().required(),
  doctor_id:       Joi.string().uuid().required(),
  scheduled_at:    Joi.date().iso().required(),
  duration_minutes: Joi.number().integer().min(10).max(180).default(30),
  type:            Joi.string().valid(...apptTypes).default('consultation'),
  chief_complaint: Joi.string().max(1000).optional().allow(''),
  notes:           Joi.string().max(2000).optional().allow(''),
});

const updateAppointmentSchema = Joi.object({
  scheduled_at:    Joi.date().iso().optional(),
  duration_minutes: Joi.number().integer().min(10).max(180).optional(),
  type:            Joi.string().valid(...apptTypes).optional(),
  chief_complaint: Joi.string().max(1000).optional().allow(''),
  notes:           Joi.string().max(2000).optional().allow(''),
});

const updateStatusSchema = Joi.object({
  status:        Joi.string().valid(...apptStatuses).required(),
  cancel_reason: Joi.when('status', {
    is:   'cancelled',
    then: Joi.string().max(500).required(),
    otherwise: Joi.string().max(500).optional().allow(''),
  }),
});

const listAppointmentsSchema = Joi.object({
  page:       Joi.number().integer().min(1).default(1),
  limit:      Joi.number().integer().min(1).max(100).default(20),
  doctor_id:  Joi.string().uuid().optional(),
  patient_id: Joi.string().uuid().optional(),
  status:     Joi.string().valid(...apptStatuses).optional(),
  type:       Joi.string().valid(...apptTypes).optional(),
  date_from:  Joi.date().iso().optional(),
  date_to:    Joi.date().iso().min(Joi.ref('date_from')).optional(),
  branch_id:  Joi.string().uuid().optional(),
});

module.exports = {
  createAppointmentSchema,
  updateAppointmentSchema,
  updateStatusSchema,
  listAppointmentsSchema,
};
