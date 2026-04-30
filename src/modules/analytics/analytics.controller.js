const service = require('./analytics.service');
const { ok } = require('../../utils/response');

async function getStats(req, res) {
  const stats = await service.getWeeklyStats(req.user);
  ok(res, stats);
}

module.exports = { getStats };
