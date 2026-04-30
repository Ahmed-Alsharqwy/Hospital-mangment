const service = require('./settings.service');
const { ok } = require('../../utils/response');

async function getSettings(req, res) {
  const data = await service.getSettings();
  return ok(res, data);
}

async function updateSettings(req, res) {
  const data = await service.updateSettings(req.body);
  return ok(res, data, 'تم تحديث الإعدادات بنجاح');
}

module.exports = { getSettings, updateSettings };
