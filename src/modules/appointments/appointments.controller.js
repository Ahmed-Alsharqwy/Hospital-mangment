// src/modules/appointments/appointments.controller.js
const service = require('./appointments.service');
const { ok, created, paginated } = require('../../utils/response');

async function list(req, res) {
  const { appointments, total, page, limit } = await service.listAppointments(req.query, req.user);
  paginated(res, appointments, { page, limit, total });
}

async function getOne(req, res) {
  const appt = await service.getAppointment(req.params.id, req.user);
  ok(res, appt);
}

async function create(req, res) {
  const io   = req.app.get('io');
  const appt = await service.createAppointment(req.body, req.user, io);
  created(res, appt, 'Appointment created successfully');
}

async function update(req, res) {
  const appt = await service.updateAppointment(req.params.id, req.body, req.user);
  ok(res, appt, 'Appointment updated successfully');
}

async function updateStatus(req, res) {
  const io   = req.app.get('io');
  const appt = await service.updateStatus(req.params.id, req.body, req.user, io);
  ok(res, appt, 'Appointment status updated');
}

async function todayOverview(req, res) {
  const data = await service.getTodayOverview(req.user);
  ok(res, data);
}

module.exports = { list, getOne, create, update, updateStatus, todayOverview };
