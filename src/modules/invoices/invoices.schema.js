// src/modules/invoices/invoices.schema.js
const Joi = require('joi');

const invoiceItemSchema = Joi.object({
  type:        Joi.string().valid('consultation','lab_test','medication','procedure','room','other').required(),
  description: Joi.string().max(300).required(),
  quantity:    Joi.number().integer().min(1).default(1),
  unit_price:  Joi.number().min(0).required(),
  discount:    Joi.number().min(0).default(0),
});

const createInvoiceSchema = Joi.object({
  patient_id:     Joi.string().uuid().required(),
  appointment_id: Joi.string().uuid().optional(),
  due_date:       Joi.date().iso().optional(),
  discount:       Joi.number().min(0).default(0),
  tax:            Joi.number().min(0).default(0),
  payment_method: Joi.string().valid('cash','card','insurance','bank_transfer','other').optional(),
  insurance_claim: Joi.string().max(100).optional().allow(''),
  notes:          Joi.string().max(2000).optional().allow(''),
  items:          Joi.array().items(invoiceItemSchema).min(1).required(),
});

const recordPaymentSchema = Joi.object({
  amount:         Joi.number().min(0.01).required(),
  payment_method: Joi.string().valid('cash','card','insurance','bank_transfer','other').required(),
  notes:          Joi.string().max(500).optional(),
});

const listInvoicesSchema = Joi.object({
  page:       Joi.number().integer().min(1).default(1),
  limit:      Joi.number().integer().min(1).max(100).default(20),
  patient_id: Joi.string().uuid().optional(),
  status:     Joi.string().valid('pending','partial','paid','refunded','cancelled').optional(),
  branch_id:  Joi.string().uuid().optional(),
  date_from:  Joi.date().iso().optional(),
  date_to:    Joi.date().iso().optional(),
});

module.exports = { createInvoiceSchema, recordPaymentSchema, listInvoicesSchema };
