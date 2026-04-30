// src/modules/patients/patients.controller.js
const service = require('./patients.service');
const { ok, created, paginated } = require('../../utils/response');

async function list(req, res) {
  const { patients, total, page, limit } = await service.listPatients(req.query, req.user);
  paginated(res, patients, { page, limit, total });
}

async function getOne(req, res) {
  const patient = await service.getPatient(req.params.id, req.user);
  ok(res, patient);
}

async function create(req, res) {
  const patient = await service.createPatient(req.body, req.user);
  created(res, patient, 'Patient registered successfully');
}

async function update(req, res) {
  const patient = await service.updatePatient(req.params.id, req.body, req.user);
  ok(res, patient, 'Patient updated successfully');
}

async function remove(req, res) {
  await service.deletePatient(req.params.id, req.user);
  ok(res, null, 'Patient deleted successfully');
}

async function timeline(req, res) {
  const records = await service.getPatientTimeline(req.params.id, req.user);
  ok(res, records);
}

async function history(req, res) {
  try {
    const data = await service.getPatientFullHistory(req.params.id, req.user);
    ok(res, data);
  } catch (err) {
    console.error('[History Controller Error]:', err);
    throw err;
  }
}

async function addAttachment(req, res) {
  const data = await service.addAttachment(req.params.id, req.body, req.user);
  created(res, data, 'Attachment added successfully');
}

module.exports = { list, getOne, create, update, remove, timeline, history, addAttachment };
