// src/modules/invoices/invoices.service.js
const { db }    = require('../../db/knex');
const AppError  = require('../../utils/AppError');
const { paginate } = require('../../utils/paginate');
const { logAudit } = require('../../middleware/audit');

async function generateInvoiceNumber() {
  const result = await db.raw("SELECT generate_invoice_number() AS num");
  return result.rows[0].num;
}

// ─────────────────────────────────────────────
// List invoices
// ─────────────────────────────────────────────

async function listInvoices(queryParams, user) {
  const { page, limit, patient_id, status, branch_id, date_from, date_to } = queryParams;

  let query = db('invoices as inv')
    .join('patients as p', 'inv.patient_id', 'p.id')
    .join('branches as b', 'inv.branch_id',  'b.id')
    .select(
      'inv.id', 'inv.invoice_number', 'inv.issued_at', 'inv.due_date',
      'inv.subtotal', 'inv.discount', 'inv.tax', 'inv.total_amount',
      'inv.paid_amount', 'inv.status', 'inv.payment_method',
      'p.id as patient_id', 'p.full_name as patient_name', 'p.mrn',
      'b.id as branch_id', 'b.name as branch_name'
    )
    .orderBy('inv.issued_at', 'desc');

  if (user.role !== 'super_admin') {
    query = query.where('inv.branch_id', user.branch_id);
  } else if (branch_id) {
    query = query.where('inv.branch_id', branch_id);
  }

  if (patient_id) query = query.where('inv.patient_id', patient_id);
  if (status)     query = query.where('inv.status', status);
  if (date_from)  query = query.where('inv.issued_at', '>=', date_from);
  if (date_to)    query = query.where('inv.issued_at', '<=', date_to);

  const { count } = await query.clone().clearSelect().clearOrder().count('inv.id as count').first();
  const { query: pq, page: pg, limit: lm } = paginate(query, { page, limit });
  const invoices = await pq;

  return { invoices, total: parseInt(count), page: pg, limit: lm };
}

// ─────────────────────────────────────────────
// Get single invoice with items
// ─────────────────────────────────────────────

async function getInvoice(id, user) {
  const inv = await db('invoices as inv')
    .join('patients as p', 'inv.patient_id', 'p.id')
    .join('branches as b', 'inv.branch_id',  'b.id')
    .leftJoin('users as u', 'inv.created_by', 'u.id')
    .where('inv.id', id)
    .select(
      'inv.*',
      'p.full_name as patient_name', 'p.mrn', 'p.phone as patient_phone',
      'p.insurance_provider', 'p.insurance_number',
      'b.name as branch_name', 'b.phone as branch_phone', 'b.address as branch_address',
      'u.full_name as created_by_name'
    )
    .first();

  if (!inv) throw AppError.notFound('Invoice');

  if (user.role !== 'super_admin' && inv.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  const items = await db('invoice_items').where({ invoice_id: id }).orderBy('created_at');
  return { ...inv, items };
}

// ─────────────────────────────────────────────
// Create invoice (with auto-calculation)
// ─────────────────────────────────────────────

async function createInvoice(data, user) {
  const patient = await db('patients').where({ id: data.patient_id }).first();
  if (!patient) throw AppError.notFound('Patient');

  if (user.role !== 'super_admin' && patient.branch_id !== user.branch_id) {
    throw AppError.forbidden('Access denied');
  }

  // Calculate totals from items
  const items = data.items.map(item => ({
    ...item,
    total_price: parseFloat(((item.quantity * item.unit_price) - item.discount).toFixed(2)),
  }));

  const subtotal     = parseFloat(items.reduce((sum, i) => sum + i.total_price, 0).toFixed(2));
  const discount     = parseFloat((data.discount || 0).toFixed(2));
  const tax          = parseFloat((data.tax || 0).toFixed(2));
  const total_amount = parseFloat((subtotal - discount + tax).toFixed(2));

  if (total_amount < 0) throw AppError.badRequest('Total amount cannot be negative');

  const invoiceNumber = await generateInvoiceNumber();

  return await db.transaction(async (trx) => {
    const [invoice] = await trx('invoices')
      .insert({
        patient_id:      data.patient_id,
        branch_id:       patient.branch_id,
        appointment_id:  data.appointment_id || null,
        invoice_number:  invoiceNumber,
        due_date:        data.due_date || null,
        subtotal,
        discount,
        tax,
        total_amount,
        paid_amount:     0,
        status:          'pending',
        payment_method:  data.payment_method || null,
        insurance_claim: data.insurance_claim || null,
        notes:           data.notes || null,
        created_by:      user.id,
      })
      .returning('*');

    const itemRows = items.map(item => ({ ...item, invoice_id: invoice.id }));
    const insertedItems = await trx('invoice_items').insert(itemRows).returning('*');

    await logAudit({
      userId: user.id, action: 'CREATE',
      entityType: 'invoice', entityId: invoice.id,
      newValues: { invoice_number: invoiceNumber, total_amount },
    });

    // Return full invoice with names for the UI/Print
    return { 
      ...invoice, 
      items: insertedItems,
      patient_name: patient.full_name,
      mrn: patient.mrn
    };
  });
}

// ─────────────────────────────────────────────
// Record payment (partial or full)
// ─────────────────────────────────────────────

async function recordPayment(invoiceId, { amount, payment_method, notes }, user) {
  const inv = await db('invoices').where({ id: invoiceId }).first();
  if (!inv) throw AppError.notFound('Invoice');

  if (['paid', 'refunded', 'cancelled'].includes(inv.status)) {
    throw AppError.badRequest(`Cannot record payment on a ${inv.status} invoice`);
  }

  const newPaidAmount = parseFloat((parseFloat(inv.paid_amount) + amount).toFixed(2));

  if (newPaidAmount > inv.total_amount) {
    throw AppError.badRequest(
      `Payment of ${amount} exceeds remaining balance of ${(inv.total_amount - inv.paid_amount).toFixed(2)}`,
      'OVERPAYMENT'
    );
  }

  // Determine new status
  let newStatus = 'partial';
  if (newPaidAmount >= inv.total_amount) newStatus = 'paid';

  const [updated] = await db('invoices')
    .where({ id: invoiceId })
    .update({
      paid_amount:    newPaidAmount,
      status:         newStatus,
      payment_method: payment_method,
      updated_at:     new Date(),
    })
    .returning('*');

  await logAudit({
    userId: user.id, action: 'UPDATE',
    entityType: 'invoice', entityId: invoiceId,
    oldValues: { paid_amount: inv.paid_amount, status: inv.status },
    newValues:  { paid_amount: newPaidAmount, status: newStatus, payment: amount },
  });

  return updated;
}

// ─────────────────────────────────────────────
// Cancel invoice
// ─────────────────────────────────────────────

async function cancelInvoice(invoiceId, user) {
  const inv = await db('invoices').where({ id: invoiceId }).first();
  if (!inv) throw AppError.notFound('Invoice');
  if (inv.status === 'paid') throw AppError.badRequest('Cannot cancel a paid invoice');
  if (inv.status === 'cancelled') throw AppError.badRequest('Invoice already cancelled');

  const [updated] = await db('invoices')
    .where({ id: invoiceId })
    .update({ status: 'cancelled', updated_at: new Date() })
    .returning('*');

  await logAudit({
    userId: user.id, action: 'UPDATE',
    entityType: 'invoice', entityId: invoiceId,
    oldValues: { status: inv.status }, newValues: { status: 'cancelled' },
  });

  return updated;
}

// ─────────────────────────────────────────────
// Revenue summary (for dashboard)
// ─────────────────────────────────────────────

async function getRevenueSummary(user, period = 'month') {
  const branchFilter = user.role !== 'super_admin' ? { branch_id: user.branch_id } : {};

  let dateFilter;
  if (period === 'today')  dateFilter = db.raw("DATE(issued_at) = CURRENT_DATE");
  if (period === 'week')   dateFilter = db.raw("issued_at >= NOW() - INTERVAL '7 days'");
  if (period === 'month')  dateFilter = db.raw("issued_at >= NOW() - INTERVAL '30 days'");
  if (period === 'year')   dateFilter = db.raw("issued_at >= NOW() - INTERVAL '365 days'");

  const summary = await db('invoices')
    .where(branchFilter)
    .where(dateFilter || db.raw('1=1'))
    .select(
      db.raw("COUNT(*) AS total_invoices"),
      db.raw("COUNT(*) FILTER (WHERE status = 'paid')     AS paid_count"),
      db.raw("COUNT(*) FILTER (WHERE status = 'pending')  AS pending_count"),
      db.raw("COUNT(*) FILTER (WHERE status = 'partial')  AS partial_count"),
      db.raw("COALESCE(SUM(total_amount), 0)              AS total_billed"),
      db.raw("COALESCE(SUM(paid_amount), 0)               AS total_collected"),
      db.raw("COALESCE(SUM(total_amount - paid_amount) FILTER (WHERE status != 'cancelled'), 0) AS outstanding")
    )
    .first();

  return summary;
}

module.exports = { listInvoices, getInvoice, createInvoice, recordPayment, cancelInvoice, getRevenueSummary };
