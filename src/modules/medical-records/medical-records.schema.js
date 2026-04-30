// src/modules/medical-records/medical-records.schema.js
const Joi = require('joi');

const createRecordSchema = Joi.object({
  patient_id:           Joi.string().uuid().required(),
  doctor_id:            Joi.string().uuid().optional(), // overridden for doctor role
  appointment_id:       Joi.string().uuid().optional(),
  visit_date:           Joi.date().iso().optional(),
  chief_complaint:      Joi.string().min(2).max(1000).required(),
  history_of_illness:   Joi.string().max(5000).optional().allow(''),
  physical_examination: Joi.string().max(5000).optional().allow(''),
  notes:                Joi.string().max(5000).optional().allow(''),
});

const updateRecordSchema = Joi.object({
  chief_complaint:      Joi.string().max(1000).optional().allow(''),
  history_of_illness:   Joi.string().max(5000).optional().allow(''),
  physical_examination: Joi.string().max(5000).optional().allow(''),
  notes:                Joi.string().max(5000).optional().allow(''),
  status:               Joi.string().valid('draft', 'finalized').optional(),
});

const vitalSignsSchema = Joi.object({
  temperature:        Joi.number().min(30).max(45).optional(),
  systolic_bp:        Joi.number().integer().min(50).max(300).optional(),
  diastolic_bp:       Joi.number().integer().min(30).max(200).optional(),
  pulse_rate:         Joi.number().integer().min(20).max(300).optional(),
  respiratory_rate:   Joi.number().integer().min(5).max(60).optional(),
  oxygen_saturation:  Joi.number().min(50).max(100).optional(),
  weight:             Joi.number().min(0.5).max(500).optional(),
  height:             Joi.number().min(20).max(300).optional(),
  blood_glucose:      Joi.number().min(10).max(1000).optional(),
  notes:              Joi.string().max(1000).optional().allow(''),
});

const diagnosisSchema = Joi.object({
  icd_code:    Joi.string().max(20).optional().allow(''),
  description: Joi.string().min(2).max(2000).required(),
  severity:    Joi.string().valid('mild', 'moderate', 'severe').default('mild'),
  status:      Joi.string().valid('active', 'resolved', 'chronic').default('active'),
  notes:       Joi.string().max(2000).optional().allow(''),
});

const listRecordsSchema = Joi.object({
  page:       Joi.number().integer().min(1).default(1),
  limit:      Joi.number().integer().min(1).max(100).default(20),
  patient_id: Joi.string().uuid().optional(),
  doctor_id:  Joi.string().uuid().optional(),
  date_from:  Joi.date().iso().optional(),
  date_to:    Joi.date().iso().optional(),
});

module.exports = {
  createRecordSchema, updateRecordSchema,
  vitalSignsSchema, diagnosisSchema, listRecordsSchema,
};
