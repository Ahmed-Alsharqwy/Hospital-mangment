// src/modules/nurses/nurses.controller.js
const service = require('./nurses.service');
const { ok, created, paginated } = require('../../utils/response');

async function list(req, res) {
  const { nurses, total, page, limit } = await service.listNurses(req.query, req.user);
  paginated(res, nurses, { page, limit, total });
}
async function getOne(req, res) {
  ok(res, await service.getNurse(req.params.id, req.user));
}
async function create(req, res) {
  created(res, await service.createNurse(req.body, req.user), 'Nurse created successfully');
}
async function update(req, res) {
  ok(res, await service.updateNurse(req.params.id, req.body, req.user), 'Nurse updated successfully');
}

module.exports = { list, getOne, create, update };
