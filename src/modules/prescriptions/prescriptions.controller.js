// src/modules/prescriptions/prescriptions.controller.js
const service = require('./prescriptions.service');
const { ok, created } = require('../../utils/response');

async function create(req, res) {
  const rx = await service.createPrescription(req.body, req.user);
  created(res, rx, 'Prescription created successfully');
}

async function getOne(req, res) {
  const rx = await service.getPrescription(req.params.id, req.user);
  ok(res, rx);
}

async function listByPatient(req, res) {
  const list = await service.listPatientPrescriptions(req.params.patientId, req.user);
  ok(res, list);
}

async function cancel(req, res) {
  const rx = await service.cancelPrescription(req.params.id, req.user);
  ok(res, rx, 'Prescription cancelled');
}

module.exports = { create, getOne, listByPatient, cancel };
