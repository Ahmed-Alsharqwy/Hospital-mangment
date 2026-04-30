// src/modules/dashboard/dashboard.controller.js
const service  = require('./dashboard.service');
const { ok }   = require('../../utils/response');

/**
 * Smart dashboard — returns different data based on the caller's role
 */
async function getDashboard(req, res) {
  const { role } = req.user;
  let data;

  if (role === 'super_admin' || role === 'admin') {
    data = await service.getAdminDashboard(req.user);
  } else if (role === 'doctor') {
    data = await service.getDoctorDashboard(req.user);
  } else if (role === 'nurse') {
    data = await service.getNurseDashboard(req.user);
  } else if (role === 'receptionist') {
    data = await service.getReceptionistDashboard(req.user);
  } else {
    data = {};
  }

  ok(res, { role, ...data });
}

module.exports = { getDashboard };
