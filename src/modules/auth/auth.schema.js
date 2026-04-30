// src/modules/auth/auth.schema.js
const Joi = require('joi');

const loginSchema = Joi.object({
  email:    Joi.string().email().lowercase().required(),
  password: Joi.string().min(6).required(),
});

const refreshSchema = Joi.object({
  refresh_token: Joi.string().required(),
});

const changePasswordSchema = Joi.object({
  old_password: Joi.string().required(),
  new_password: Joi.string().min(8).required(),
  confirm_password: Joi.string().valid(Joi.ref('new_password')).required()
    .messages({ 'any.only': 'Passwords do not match' }),
});

// Admin-only: create a new user
const createUserSchema = Joi.object({
  email:       Joi.string().email().lowercase().required(),
  password:    Joi.string().min(8).required(),
  full_name:   Joi.string().min(2).max(200).required(),
  full_name_ar: Joi.string().max(200).optional(),
  role:        Joi.string().valid('admin', 'doctor', 'nurse', 'receptionist').required(),
  phone:       Joi.string().max(20).optional(),
  national_id: Joi.string().max(50).optional(),
  branch_id:   Joi.string().uuid().required(),
});

module.exports = { loginSchema, refreshSchema, changePasswordSchema, createUserSchema };
