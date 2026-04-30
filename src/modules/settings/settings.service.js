const { db } = require('../../db/knex');
const AppError = require('../../utils/AppError');

async function getSettings() {
  const org = await db('organizations').first();
  if (!org) throw AppError.notFound('Organization settings not found');
  return org;
}

async function updateSettings(data) {
  const org = await db('organizations').first();
  if (!org) throw AppError.notFound('Organization settings not found');

  const [updated] = await db('organizations')
    .where({ id: org.id })
    .update({
      ...data,
      updated_at: new Date()
    })
    .returning('*');

  return updated;
}

module.exports = { getSettings, updateSettings };
