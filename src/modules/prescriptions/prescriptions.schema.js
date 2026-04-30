// src/modules/prescriptions/prescriptions.schema.js
const Joi = require('joi');

const prescriptionItemSchema = Joi.object({
  medication_name: Joi.string().max(200).required(),
  generic_name:    Joi.string().max(200).optional(),
  dosage:          Joi.string().max(100).required(),
  frequency:       Joi.string().max(100).required(),
  duration:        Joi.string().max(100).required(),
  route:           Joi.string().valid('oral','injection','topical','inhalation','sublingual','rectal','other').default('oral'),
  quantity:        Joi.number().integer().min(1).default(1),
  instructions:    Joi.string().max(500).optional(),
});

const createPrescriptionSchema = Joi.object({
  medical_record_id: Joi.string().uuid().required(),
  doctor_id:         Joi.string().uuid().optional(),
  valid_until:       Joi.date().iso().greater('now').optional(),
  notes:             Joi.string().max(2000).optional(),
  items:             Joi.array().items(prescriptionItemSchema).min(1).required(),
});

module.exports = { createPrescriptionSchema };
