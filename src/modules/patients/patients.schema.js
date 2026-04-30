// src/modules/patients/patients.schema.js
const Joi = require('joi');

const genders    = ['male', 'female'];
const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const createPatientSchema = Joi.object({
  full_name:               Joi.string().min(2).max(200).required(),
  full_name_ar:            Joi.string().max(200).optional().allow(''),
  date_of_birth:           Joi.date().iso().max('now').required(),
  gender:                  Joi.string().valid(...genders).required(),
  national_id:             Joi.string().max(50).optional().allow(''),
  phone:                   Joi.string().max(20).required(),
  email:                   Joi.string().email().lowercase().optional().allow(''),
  address:                 Joi.string().max(500).optional().allow(''),
  blood_type:              Joi.string().valid(...bloodTypes).optional().allow(null, ''),
  allergies:               Joi.string().max(1000).optional().allow(''),
  chronic_conditions:      Joi.string().max(1000).optional().allow(''),
  emergency_contact_name:  Joi.string().max(200).optional().allow(''),
  emergency_contact_phone: Joi.string().max(20).optional().allow(''),
  emergency_contact_rel:   Joi.string().max(50).optional().allow(''),
  insurance_provider:      Joi.string().max(150).optional().allow(''),
  insurance_number:        Joi.string().max(100).optional().allow(''),
  insurance_expiry:        Joi.date().iso().optional().allow(null, ''),
  notes:                   Joi.string().max(2000).optional().allow(''),
});

const updatePatientSchema = createPatientSchema.fork(
  ['full_name', 'date_of_birth', 'gender', 'phone'],
  (field) => field.optional()
);

const listPatientsSchema = Joi.object({
  page:      Joi.number().integer().min(1).default(1),
  limit:     Joi.number().integer().min(1).max(100).default(20),
  search:    Joi.string().max(100).optional(),      // name, phone, MRN
  branch_id: Joi.string().uuid().optional(),
  gender:    Joi.string().valid(...genders).optional(),
  blood_type: Joi.string().valid(...bloodTypes).optional(),
  status:    Joi.string().valid('active', 'completed').optional(),
});

module.exports = { createPatientSchema, updatePatientSchema, listPatientsSchema };
