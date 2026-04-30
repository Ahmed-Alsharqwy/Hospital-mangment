// src/modules/doctors/doctors.schema.js
const Joi = require('joi');

const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const createDoctorSchema = Joi.object({
  // User fields
  email:          Joi.string().email().lowercase().required(),
  password:       Joi.string().min(8).required(),
  full_name:      Joi.string().min(2).max(200).required(),
  full_name_ar:   Joi.string().max(200).optional(),
  phone:          Joi.string().max(20).optional(),
  national_id:    Joi.string().max(50).optional(),
  branch_id:      Joi.string().uuid().required(),
  // Doctor fields
  department_id:      Joi.string().uuid().optional(),
  specialization:     Joi.string().max(200).required(),
  license_number:     Joi.string().max(100).required(),
  qualification:      Joi.string().max(1000).optional(),
  consultation_fee:   Joi.number().min(0).default(0),
  bio:                Joi.string().max(2000).optional(),
  available_days:     Joi.array().items(Joi.string().valid(...days)).default([]),
  work_start_time:    Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  work_end_time:      Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  max_daily_patients: Joi.number().integer().min(1).max(200).default(20),
});

const updateDoctorSchema = Joi.object({
  full_name:          Joi.string().min(2).max(200).optional(),
  full_name_ar:       Joi.string().max(200).optional(),
  phone:              Joi.string().max(20).optional(),
  department_id:      Joi.string().uuid().optional(),
  specialization:     Joi.string().max(200).optional(),
  qualification:      Joi.string().max(1000).optional(),
  consultation_fee:   Joi.number().min(0).optional(),
  bio:                Joi.string().max(2000).optional(),
  available_days:     Joi.array().items(Joi.string().valid(...days)).optional(),
  work_start_time:    Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  work_end_time:      Joi.string().pattern(/^\d{2}:\d{2}$/).optional(),
  max_daily_patients: Joi.number().integer().min(1).max(200).optional(),
  is_active:          Joi.boolean().optional(),
});

const listDoctorsSchema = Joi.object({
  page:           Joi.number().integer().min(1).default(1),
  limit:          Joi.number().integer().min(1).max(100).default(20),
  search:         Joi.string().max(100).optional(),
  branch_id:      Joi.string().uuid().optional(),
  department_id:  Joi.string().uuid().optional(),
  specialization: Joi.string().max(200).optional(),
  available_day:  Joi.string().valid(...days).optional(),
});

module.exports = { createDoctorSchema, updateDoctorSchema, listDoctorsSchema };
