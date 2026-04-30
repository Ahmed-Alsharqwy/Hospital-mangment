const { db } = require('../../db/knex');

async function getWeeklyStats(user) {
  const branchFilter = user.role !== 'super_admin' ? { branch_id: user.branch_id } : {};

  // 1. Weekly activity (last 7 days)
  const activity = await db('appointments')
    .where(branchFilter)
    .where('scheduled_at', '>=', db.raw("CURRENT_DATE - INTERVAL '7 days'"))
    .select(
      db.raw("TO_CHAR(scheduled_at, 'Day') as day"),
      db.raw("COUNT(*)::int as patients"),
      db.raw("COUNT(*) FILTER (WHERE status = 'completed')::int as completed")
    )
    .groupBy('day')
    .orderBy(db.raw("MIN(scheduled_at)"));

  // 2. Department distribution
  const departments = await db('appointments as a')
    .join('doctors as d', 'a.doctor_id', 'd.id')
    .where(branchFilter)
    .select('d.specialization as name')
    .select(db.raw("COUNT(a.id)::int as value"))
    .groupBy('d.specialization');

  // 3. Revenue trend (last 30 days)
  const revenueTrend = await db('invoices')
    .where(branchFilter)
    .where('issued_at', '>=', db.raw("CURRENT_DATE - INTERVAL '30 days'"))
    .select(
      db.raw("DATE_TRUNC('day', issued_at) as date"),
      db.raw("SUM(total_amount)::float as revenue")
    )
    .groupBy('date')
    .orderBy('date');

  // 4. Total counts
  const totalPatients = await db('patients').where(branchFilter).count('id as count').first();
  const totalDoctors  = await db('doctors as d')
    .join('users as u', 'd.user_id', 'u.id')
    .where('u.is_active', true)
    .count('d.id as count').first();
  const totalAppointments = await db('appointments').where(branchFilter).count('id as count').first();
  const totalInvoices = await db('invoices').where(branchFilter).count('id as count').first();
  const totalRecords  = await db('medical_records').count('id as count').first();

  // 5. Appointments by status
  const appointmentsByStatus = await db('appointments')
    .where(branchFilter)
    .select('status')
    .count('id as count')
    .groupBy('status');

  // 6. Invoices by status
  const invoicesByStatus = await db('invoices')
    .where(branchFilter)
    .select('status')
    .count('id as count')
    .groupBy('status');

  // 7. Revenue summary
  const revenueSummary = await db('invoices')
    .where(branchFilter)
    .select(
      db.raw("COALESCE(SUM(total_amount), 0)::float as total_billed"),
      db.raw("COALESCE(SUM(paid_amount), 0)::float as total_collected"),
      db.raw("COALESCE(SUM(total_amount) - SUM(paid_amount), 0)::float as outstanding")
    )
    .first();

  // 8. New patients this month
  const newPatientsThisMonth = await db('patients')
    .where(branchFilter)
    .where('created_at', '>=', db.raw("DATE_TRUNC('month', CURRENT_DATE)"))
    .count('id as count').first();

  // 9. Today's appointments
  const todayAppointments = await db('appointments')
    .where(branchFilter)
    .whereRaw("DATE(scheduled_at) = CURRENT_DATE")
    .select(
      db.raw("COUNT(*)::int as total"),
      db.raw("COUNT(*) FILTER (WHERE status = 'completed')::int as completed"),
      db.raw("COUNT(*) FILTER (WHERE status = 'in_progress')::int as in_progress"),
      db.raw("COUNT(*) FILTER (WHERE status = 'cancelled')::int as cancelled")
    )
    .first();

  // 10. Top doctors by completed appointments
  const topDoctors = await db('appointments as a')
    .join('doctors as d', 'a.doctor_id', 'd.id')
    .join('users as u', 'd.user_id', 'u.id')
    .where('a.status', 'completed')
    .select('u.full_name as name', 'd.specialization')
    .count('a.id as count')
    .groupBy('u.full_name', 'd.specialization')
    .orderBy('count', 'desc')
    .limit(5);

  // 11. Gender distribution
  const genderDist = await db('patients')
    .where(branchFilter)
    .select('gender')
    .count('id as count')
    .groupBy('gender');

  // 12. Monthly comparison (this month vs last month)
  const thisMonthRevenue = await db('invoices')
    .where(branchFilter)
    .whereRaw("issued_at >= DATE_TRUNC('month', CURRENT_DATE)")
    .select(db.raw("COALESCE(SUM(total_amount), 0)::float as total"))
    .first();
  const lastMonthRevenue = await db('invoices')
    .where(branchFilter)
    .whereRaw("issued_at >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'")
    .whereRaw("issued_at < DATE_TRUNC('month', CURRENT_DATE)")
    .select(db.raw("COALESCE(SUM(total_amount), 0)::float as total"))
    .first();

  return {
    activity,
    departments,
    revenueTrend,
    totals: {
      patients: parseInt(totalPatients.count),
      doctors:  parseInt(totalDoctors.count),
      appointments: parseInt(totalAppointments.count),
      invoices: parseInt(totalInvoices.count),
      records: parseInt(totalRecords.count),
      newPatientsThisMonth: parseInt(newPatientsThisMonth.count),
    },
    appointmentsByStatus: appointmentsByStatus.map(r => ({ status: r.status, count: parseInt(r.count) })),
    invoicesByStatus: invoicesByStatus.map(r => ({ status: r.status, count: parseInt(r.count) })),
    revenueSummary,
    todayAppointments,
    topDoctors: topDoctors.map(r => ({ ...r, count: parseInt(r.count) })),
    genderDist: genderDist.map(r => ({ gender: r.gender, count: parseInt(r.count) })),
    monthlyComparison: {
      thisMonth: thisMonthRevenue.total,
      lastMonth: lastMonthRevenue.total,
      change: lastMonthRevenue.total > 0
        ? Math.round(((thisMonthRevenue.total - lastMonthRevenue.total) / lastMonthRevenue.total) * 100)
        : 0
    }
  };
}

module.exports = { getWeeklyStats };
