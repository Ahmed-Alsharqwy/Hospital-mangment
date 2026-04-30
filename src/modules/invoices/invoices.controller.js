// src/modules/invoices/invoices.controller.js
const service = require('./invoices.service');
const { ok, created, paginated } = require('../../utils/response');

async function list(req, res) {
  const { invoices, total, page, limit } = await service.listInvoices(req.query, req.user);
  paginated(res, invoices, { page, limit, total });
}
async function getOne(req, res) {
  ok(res, await service.getInvoice(req.params.id, req.user));
}
async function create(req, res) {
  created(res, await service.createInvoice(req.body, req.user), 'Invoice created');
}
async function recordPayment(req, res) {
  ok(res, await service.recordPayment(req.params.id, req.body, req.user), 'Payment recorded');
}
async function cancel(req, res) {
  ok(res, await service.cancelInvoice(req.params.id, req.user), 'Invoice cancelled');
}
async function revenueSummary(req, res) {
  const period = req.query.period || 'month';
  ok(res, await service.getRevenueSummary(req.user, period));
}

module.exports = { list, getOne, create, recordPayment, cancel, revenueSummary };
