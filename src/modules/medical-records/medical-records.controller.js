// src/modules/medical-records/medical-records.controller.js
const service = require('./medical-records.service');
const { ok, created, paginated } = require('../../utils/response');

async function list(req, res) {
  const { records, total, page, limit } = await service.listRecords(req.query, req.user);
  paginated(res, records, { page, limit, total });
}

async function getOne(req, res) {
  const record = await service.getRecord(req.params.id, req.user);
  ok(res, record);
}

async function create(req, res) {
  const record = await service.createRecord(req.body, req.user);
  created(res, record, 'Medical record created');
}

async function update(req, res) {
  const record = await service.updateRecord(req.params.id, req.body, req.user);
  ok(res, record, 'Medical record updated');
}

// Vital signs
async function addVitals(req, res) {
  const vitals = await service.addVitalSigns(req.params.id, req.body, req.user);
  created(res, vitals, 'Vital signs recorded');
}

// Diagnoses
async function addDiagnosis(req, res) {
  const d = await service.addDiagnosis(req.params.id, req.body, req.user);
  created(res, d, 'Diagnosis added');
}

async function updateDiagnosis(req, res) {
  const d = await service.updateDiagnosis(req.params.diagnosisId, req.body, req.user);
  ok(res, d, 'Diagnosis updated');
}

async function deleteDiagnosis(req, res) {
  await service.deleteDiagnosis(req.params.diagnosisId, req.user);
  ok(res, null, 'Diagnosis deleted');
}

module.exports = { list, getOne, create, update, addVitals, addDiagnosis, updateDiagnosis, deleteDiagnosis };
