// src/modules/nurses/nurses.schema.js
const Joi = require('joi');

const createNurseSchema = Joi.object({
  email:          Joi.string().email().lowercase().required(),
  password:       Joi.string().min(8).required(),
  full_name:      Joi.string().min(2).max(200).required(),
  full_name_ar:   Joi.string().max(200).optional(),
  phone:          Joi.string().max(20).optional(),
  national_id:    Joi.string().max(50).optional(),
  branch_id:      Joi.string().uuid().required(),
  department_id:  Joi.string().uuid().optional(),
  license_number: Joi.string().max(100).optional(),
  shift:          Joi.string().valid('morning', 'afternoon', 'night').default('morning'),
  qualification:  Joi.string().max(1000).optional(),
});

const updateNurseSchema = Joi.object({
  full_name:      Joi.string().min(2).max(200).optional(),
  full_name_ar:   Joi.string().max(200).optional(),
  phone:          Joi.string().max(20).optional(),
  department_id:  Joi.string().uuid().optional(),
  shift:          Joi.string().valid('morning', 'afternoon', 'night').optional(),
  qualification:  Joi.string().max(1000).optional(),
  is_active:      Joi.boolean().optional(),
});

const listNursesSchema = Joi.object({
  page:          Joi.number().integer().min(1).default(1),
  limit:         Joi.number().integer().min(1).max(100).default(20),
  search:        Joi.string().max(100).optional(),
  branch_id:     Joi.string().uuid().optional(),
  department_id: Joi.string().uuid().optional(),
  shift:         Joi.string().valid('morning', 'afternoon', 'night').optional(),
});

module.exports = { createNurseSchema, updateNurseSchema, listNursesSchema };
