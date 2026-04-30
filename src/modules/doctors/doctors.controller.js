// src/modules/doctors/doctors.controller.js
const service = require('./doctors.service');
const { ok, created, paginated } = require('../../utils/response');

async function list(req, res) {
  const { doctors, total, page, limit } = await service.listDoctors(req.query, req.user);
  paginated(res, doctors, { page, limit, total });
}

async function getOne(req, res) {
  const doctor = await service.getDoctor(req.params.id, req.user);
  ok(res, doctor);
}

async function create(req, res) {
  const doctor = await service.createDoctor(req.body, req.user);
  created(res, doctor, 'Doctor created successfully');
}

async function update(req, res) {
  const doctor = await service.updateDoctor(req.params.id, req.body, req.user);
  ok(res, doctor, 'Doctor updated successfully');
}

async function schedule(req, res) {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const data  = await service.getDoctorSchedule(req.params.id, date);
  ok(res, data);
}

module.exports = { list, getOne, create, update, schedule };
