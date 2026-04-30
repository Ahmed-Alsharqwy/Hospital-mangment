// src/modules/dashboard/dashboard.service.js
const { db } = require('../../db/knex');

// ─────────────────────────────────────────────
// Admin / Super Admin Dashboard
// ─────────────────────────────────────────────

async function getAdminDashboard(user) {
  const branchId = user.role !== 'super_admin' ? user.branch_id : null;
  const bFilter  = branchId ? { 'branch_id': branchId } : {};
  const bFilterP = branchId ? { 'p.branch_id': branchId } : {};
  const bFilterA = branchId ? { 'a.branch_id': branchId } : {};

  const [
    patientStats,
    appointmentStats,
    todayAppointments,
    revenueStats,
    topDoctors,
    recentPatients,
    weeklyAppointments,
    staffCounts,
  ] = await Promise.all([

    // Total patients
    db('patients').where(bFilter)
      .select(
        db.raw("COUNT(*) AS total"),
        db.raw("COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS new_this_month"),
        db.raw("COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS new_this_week"),
      ).first(),

    // Appointment stats
    db('appointments as a').where(bFilterA)
      .select(
        db.raw("COUNT(*) AS total"),
        db.raw("COUNT(*) FILTER (WHERE status = 'completed')   AS completed"),
        db.raw("COUNT(*) FILTER (WHERE status = 'cancelled')   AS cancelled"),
        db.raw("COUNT(*) FILTER (WHERE status = 'no_show')     AS no_show"),
        db.raw("COUNT(*) FILTER (WHERE scheduled_at >= NOW() - INTERVAL '30 days') AS this_month"),
      ).first(),

    // Today's appointments breakdown
    db('appointments as a').where(bFilterA)
      .whereRaw("DATE(a.scheduled_at) = CURRENT_DATE")
      .select(
        db.raw("COUNT(*) AS total"),
        db.raw("COUNT(*) FILTER (WHERE status = 'scheduled')   AS scheduled"),
        db.raw("COUNT(*) FILTER (WHERE status = 'confirmed')   AS confirmed"),
        db.raw("COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress"),
        db.raw("COUNT(*) FILTER (WHERE status = 'completed')   AS completed"),
        db.raw("COUNT(*) FILTER (WHERE status = 'cancelled')   AS cancelled"),
      ).first(),

    // Revenue
    db('invoices').where(bFilter)
      .select(
        db.raw("COALESCE(SUM(total_amount), 0)                                                          AS total_billed"),
        db.raw("COALESCE(SUM(paid_amount), 0)                                                           AS total_collected"),
        db.raw("COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE status != 'cancelled'), 0)       AS outstanding"),
        db.raw("COALESCE(SUM(total_amount) FILTER (WHERE issued_at >= NOW() - INTERVAL '30 days'), 0)   AS this_month_billed"),
        db.raw("COALESCE(SUM(paid_amount)  FILTER (WHERE issued_at >= NOW() - INTERVAL '30 days'), 0)   AS this_month_collected"),
      ).first(),

    // Top 5 doctors by completed appointments
    db('appointments as a')
      .join('doctors as d', 'a.doctor_id', 'd.id')
      .join('users as u',   'd.user_id',   'u.id')
      .where(bFilterA)
      .where('a.status', 'completed')
      .groupBy('d.id', 'u.full_name', 'd.specialization')
      .select(
        'd.id', 'u.full_name as doctor_name', 'd.specialization',
        db.raw("COUNT(*) AS completed_appointments"),
        db.raw("COUNT(DISTINCT a.patient_id) AS unique_patients"),
      )
      .orderBy('completed_appointments', 'desc')
      .limit(5),

    // 5 most recent patients
    db('patients as p')
      .join('branches as b', 'p.branch_id', 'b.id')
      .where(bFilterP)
      .select('p.id', 'p.mrn', 'p.full_name', 'p.gender', 'p.phone', 'p.created_at', 'b.name as branch_name')
      .orderBy('p.created_at', 'desc')
      .limit(5),

    // Appointments per day for last 7 days
    db('appointments as a')
      .where(bFilterA)
      .whereRaw("a.scheduled_at >= NOW() - INTERVAL '7 days'")
      .groupByRaw("DATE(a.scheduled_at)")
      .select(
        db.raw("DATE(a.scheduled_at) AS date"),
        db.raw("COUNT(*) AS total"),
        db.raw("COUNT(*) FILTER (WHERE status = 'completed') AS completed"),
        db.raw("COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled"),
      )
      .orderBy('date', 'asc'),

    // Staff counts
    db('users').where({ ...bFilter, is_active: true })
      .select(
        db.raw("COUNT(*) FILTER (WHERE role = 'doctor')       AS doctors"),
        db.raw("COUNT(*) FILTER (WHERE role = 'nurse')        AS nurses"),
        db.raw("COUNT(*) FILTER (WHERE role = 'receptionist') AS receptionists"),
        db.raw("COUNT(*) FILTER (WHERE role = 'admin')        AS admins"),
      ).first(),
  ]);

    // ============================================
    // REAL AI Insights Generation
    // ============================================
    const health_insights = [];
    
    try {
      // 1. Disease Trend Analysis (Respiratory/Flu)
      const thisWeekFlu = await db('medical_records')
        .whereRaw("visit_date >= NOW() - INTERVAL '7 days'")
        .where(function() {
          this.whereRaw("chief_complaint ILIKE '%انفلونزا%'")
              .orWhereRaw("chief_complaint ILIKE '%سعال%'")
              .orWhereRaw("chief_complaint ILIKE '%تنفس%'")
              .orWhereRaw("chief_complaint ILIKE '%زكام%'");
        }).count('* as count').first();

      const lastWeekFlu = await db('medical_records')
        .whereRaw("visit_date >= NOW() - INTERVAL '14 days'")
        .whereRaw("visit_date < NOW() - INTERVAL '7 days'")
        .where(function() {
          this.whereRaw("chief_complaint ILIKE '%انفلونزا%'")
              .orWhereRaw("chief_complaint ILIKE '%سعال%'")
              .orWhereRaw("chief_complaint ILIKE '%تنفس%'")
              .orWhereRaw("chief_complaint ILIKE '%زكام%'");
        }).count('* as count').first();

      const twCount = parseInt(thisWeekFlu?.count || 0);
      const lwCount = parseInt(lastWeekFlu?.count || 0);
      
      if (twCount > lwCount && lwCount > 0) {
        const perc = Math.round(((twCount - lwCount) / lwCount) * 100);
        health_insights.push({ id: 1, type: 'warning', title: 'زيادة في الحالات التنفسية', message: `تم رصد زيادة بنسبة ${perc}% في حالات الجهاز التنفسي هذا الأسبوع مقارنة بالأسبوع الماضي.` });
      } else if (twCount < lwCount && twCount > 0) {
        const perc = Math.round(((lwCount - twCount) / lwCount) * 100);
        health_insights.push({ id: 1, type: 'success', title: 'انخفاض الحالات التنفسية', message: `انخفضت حالات الجهاز التنفسي بنسبة ${perc}% هذا الأسبوع.` });
      } else if (twCount > 0) {
        health_insights.push({ id: 1, type: 'warning', title: 'رصد حالات تنفسية', message: `تم تسجيل ${twCount} حالات أعراض تنفسية هذا الأسبوع، يُنصح برفع مستوى التعقيم.` });
      }

      // 2. Appointments Analysis (Busiest Day)
      const busiestDayResult = await db('appointments')
        .whereRaw("scheduled_at >= NOW() - INTERVAL '30 days'")
        .select(db.raw("EXTRACT(DOW FROM scheduled_at) as day_of_week"))
        .count('* as count')
        .groupByRaw("EXTRACT(DOW FROM scheduled_at)")
        .orderBy('count', 'desc')
        .first();

      if (busiestDayResult && parseInt(busiestDayResult.count) > 0) {
        const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const dayName = days[parseInt(busiestDayResult.day_of_week)];
        health_insights.push({ id: 2, type: 'info', title: 'تحليل المواعيد', message: `يوم ${dayName} هو الأكثر ازدحاماً للمرضى مؤخراً؛ ننصح بتوزيع المواعيد بشكل أفضل وتكثيف الكادر.` });
      }

      // 3. Financial Efficiency
      const thisMonthRev = await db('invoices')
        .whereRaw("issued_at >= NOW() - INTERVAL '30 days'")
        .select(db.raw("COALESCE(SUM(paid_amount), 0) as paid")).first();
      
      const lastMonthRev = await db('invoices')
        .whereRaw("issued_at >= NOW() - INTERVAL '60 days'")
        .whereRaw("issued_at < NOW() - INTERVAL '30 days'")
        .select(db.raw("COALESCE(SUM(paid_amount), 0) as paid")).first();

      const tmPaid = parseFloat(thisMonthRev?.paid || 0);
      const lmPaid = parseFloat(lastMonthRev?.paid || 0);

      if (tmPaid > lmPaid && lmPaid > 0) {
        const perc = Math.round(((tmPaid - lmPaid) / lmPaid) * 100);
        health_insights.push({ id: 3, type: 'success', title: 'كفاءة التحصيل المالي', message: `ارتفعت نسبة التحصيل المالي بـ ${perc}% مقارنة بالشهر الماضي. أداء ممتاز!` });
      } else if (tmPaid < lmPaid && tmPaid > 0) {
        const perc = Math.round(((lmPaid - tmPaid) / lmPaid) * 100);
        health_insights.push({ id: 3, type: 'warning', title: 'انخفاض التحصيل المالي', message: `انخفض التحصيل المالي بـ ${perc}% مقارنة بالشهر الماضي. يرجى مراجعة المتأخرات.` });
      } else if (tmPaid === 0 && lmPaid === 0) {
        // No revenue data, show a placeholder insight
        health_insights.push({ id: 3, type: 'info', title: 'المتابعة المالية', message: 'لم يتم تسجيل إيرادات كافية بعد لإجراء تحليل مالي دقيق.' });
      }
      
    } catch (err) {
      console.error('Error generating AI Insights:', err);
    }

  return {
    patients:             patientStats,
    appointments:         appointmentStats,
    today:                todayAppointments,
    revenue:              revenueStats,
    top_doctors:          topDoctors,
    recent_patients:      recentPatients,
    weekly_appointments:  weeklyAppointments,
    staff:                staffCounts,
    health_insights:      health_insights,
  };
}

// ─────────────────────────────────────────────
// Doctor Dashboard (their own data only)
// ─────────────────────────────────────────────

async function getDoctorDashboard(user) {
  const doctor = await db('doctors').where({ user_id: user.id }).select('id').first();
  if (!doctor) return null;

  const docId = doctor.id;

  const [
    todaySchedule,
    myStats,
    recentRecords,
    upcomingAppointments,
  ] = await Promise.all([

    // Today's full schedule
    db('appointments as a')
      .join('patients as p', 'a.patient_id', 'p.id')
      .where('a.doctor_id', docId)
      .whereRaw("DATE(a.scheduled_at) = CURRENT_DATE")
      .whereNotIn('a.status', ['cancelled'])
      .select(
        'a.id', 'a.scheduled_at', 'a.duration_minutes', 'a.status', 'a.type', 'a.chief_complaint',
        'p.id as patient_id', 'p.full_name as patient_name', 'p.mrn',
        'p.phone', 'p.blood_type', 'p.allergies',
      )
      .orderBy('a.scheduled_at', 'asc'),

    // My overall stats
    db('appointments')
      .where('doctor_id', docId)
      .select(
        db.raw("COUNT(*) FILTER (WHERE status = 'completed')                                      AS total_completed"),
        db.raw("COUNT(*) FILTER (WHERE DATE(scheduled_at) = CURRENT_DATE AND status != 'cancelled') AS today_total"),
        db.raw("COUNT(DISTINCT patient_id)                                                         AS total_patients"),
        db.raw("COUNT(*) FILTER (WHERE status IN ('scheduled','confirmed'))                        AS upcoming"),
      ).first(),

    // Last 5 medical records I wrote
    db('medical_records as mr')
      .join('patients as p', 'mr.patient_id', 'p.id')
      .where('mr.doctor_id', docId)
      .select('mr.id', 'mr.visit_date', 'mr.chief_complaint', 'mr.status',
              'p.full_name as patient_name', 'p.mrn')
      .orderBy('mr.visit_date', 'desc')
      .limit(5),

    // Next 5 upcoming appointments
    db('appointments as a')
      .join('patients as p', 'a.patient_id', 'p.id')
      .where('a.doctor_id', docId)
      .whereIn('a.status', ['scheduled', 'confirmed'])
      .where('a.scheduled_at', '>', new Date())
      .select(
        'a.id', 'a.scheduled_at', 'a.duration_minutes', 'a.type',
        'p.full_name as patient_name', 'p.mrn', 'p.phone',
      )
      .orderBy('a.scheduled_at', 'asc')
      .limit(5),
  ]);

  return {
    today_schedule:       todaySchedule,
    stats:                myStats,
    recent_records:       recentRecords,
    upcoming_appointments: upcomingAppointments,
  };
}

// ─────────────────────────────────────────────
// Nurse Dashboard
// ─────────────────────────────────────────────

async function getNurseDashboard(user) {
  const [todayPatients, pendingVitals, recentVitals] = await Promise.all([

    // Patients with appointments today in nurse's branch
    db('appointments as a')
      .join('patients as p', 'a.patient_id', 'p.id')
      .join('doctors as d',  'a.doctor_id',  'd.id')
      .join('users as u',    'd.user_id',    'u.id')
      .where('a.branch_id', user.branch_id)
      .whereRaw("DATE(a.scheduled_at) = CURRENT_DATE")
      .whereNotIn('a.status', ['cancelled', 'no_show'])
      .select(
        'a.id as appointment_id', 'a.scheduled_at', 'a.status',
        'p.id as patient_id', 'p.full_name as patient_name', 'p.mrn',
        'p.blood_type', 'p.allergies', 'p.phone',
        'u.full_name as doctor_name', 'd.specialization',
      )
      .orderBy('a.scheduled_at', 'asc'),

    // Patients who don't have vitals taken today
    db('appointments as a')
      .join('patients as p', 'a.patient_id', 'p.id')
      .where('a.branch_id', user.branch_id)
      .whereRaw("DATE(a.scheduled_at) = CURRENT_DATE")
      .whereIn('a.status', ['scheduled', 'confirmed'])
      .whereNotExists(
        db('vital_signs as vs')
          .where('vs.patient_id', db.raw('p.id'))
          .whereRaw("DATE(vs.measured_at) = CURRENT_DATE")
      )
      .select('p.id', 'p.full_name as patient_name', 'p.mrn', 'a.scheduled_at')
      .orderBy('a.scheduled_at', 'asc'),

    // Last 10 vitals recorded by this nurse
    db('vital_signs as vs')
      .join('patients as p', 'vs.patient_id', 'p.id')
      .where('vs.measured_by', user.id)
      .select(
        'vs.id', 'vs.measured_at', 'vs.temperature', 'vs.systolic_bp',
        'vs.diastolic_bp', 'vs.pulse_rate', 'vs.oxygen_saturation', 'vs.bmi',
        'p.full_name as patient_name', 'p.mrn',
      )
      .orderBy('vs.measured_at', 'desc')
      .limit(10),
  ]);

  return { today_patients: todayPatients, pending_vitals: pendingVitals, recent_vitals: recentVitals };
}

// ─────────────────────────────────────────────
// Receptionist Dashboard
// ─────────────────────────────────────────────

async function getReceptionistDashboard(user) {
  const [todayAppointments, pendingInvoices, recentPatients] = await Promise.all([

    db('appointments as a')
      .join('patients as p', 'a.patient_id', 'p.id')
      .join('doctors as d',  'a.doctor_id',  'd.id')
      .join('users as u',    'd.user_id',    'u.id')
      .where('a.branch_id', user.branch_id)
      .whereRaw("DATE(a.scheduled_at) = CURRENT_DATE")
      .select(
        'a.id', 'a.scheduled_at', 'a.status', 'a.type',
        'p.full_name as patient_name', 'p.mrn', 'p.phone',
        'u.full_name as doctor_name',
      )
      .orderBy('a.scheduled_at', 'asc'),

    db('invoices')
      .where({ branch_id: user.branch_id })
      .whereIn('status', ['pending', 'partial'])
      .join('patients as p', 'invoices.patient_id', 'p.id')
      .select(
        'invoices.id', 'invoices.invoice_number', 'invoices.total_amount',
        'invoices.paid_amount', 'invoices.status', 'invoices.issued_at',
        'p.full_name as patient_name', 'p.mrn',
      )
      .orderBy('invoices.issued_at', 'desc')
      .limit(10),

    db('patients')
      .where({ branch_id: user.branch_id })
      .select('id', 'mrn', 'full_name', 'phone', 'gender', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(5),
  ]);

  return {
    today_appointments: todayAppointments,
    pending_invoices:   pendingInvoices,
    recent_patients:    recentPatients,
  };
}

module.exports = {
  getAdminDashboard,
  getDoctorDashboard,
  getNurseDashboard,
  getReceptionistDashboard,
};
