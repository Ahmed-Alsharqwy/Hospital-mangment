// src/utils/paginate.js

/**
 * Extracts page/limit from query params with safe defaults.
 * Applies .limit() and .offset() to a knex query builder.
 */
function paginate(query, queryParams) {
  const page  = Math.max(1, parseInt(queryParams.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit) || 20));
  const offset = (page - 1) * limit;

  return {
    query:  query.limit(limit).offset(offset),
    page,
    limit,
  };
}

/**
 * Get total count for a given table + optional where conditions.
 */
async function countTotal(db, table, whereConditions = {}) {
  const result = await db(table).where(whereConditions).count('id as count').first();
  return parseInt(result.count);
}

module.exports = { paginate, countTotal };
