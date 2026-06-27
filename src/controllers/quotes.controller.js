const db = require('../config/db');
const { runAutomations } = require('../services/automations.service');
const crypto = require('crypto');


const genNumber = async (tenant_id) => {
  const [rows] = await db.query('SELECT COUNT(*)+1 as n FROM quotes WHERE tenant_id=?', [tenant_id]);
  return `COT-${String(rows[0].n).padStart(5, '0')}`;
};

const list = async (req, res) => {
  const { status } = req.query;
  let sql = `SELECT q.*, c.name as contact_name, u.name as created_by_name
             FROM quotes q
             LEFT JOIN contacts c ON q.contact_id = c.id
             LEFT JOIN users u ON q.created_by = u.id
             WHERE q.tenant_id = ?`;
  const params = [req.user.tenant_id];
  if (status) { sql += ' AND q.status = ?'; params.push(status); }
  sql += ' ORDER BY q.created_at DESC';
  try {
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT q.*, c.name as contact_name, c.email as contact_email, c.company as contact_company
       FROM quotes q LEFT JOIN contacts c ON q.contact_id = c.id
       WHERE q.id = ? AND q.tenant_id = ?`,
      [req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Cotización no encontrada' });
    const [items] = await db.query(
      `SELECT qi.*, p.name as product_name, p.sku FROM quote_items qi
       LEFT JOIN products p ON qi.product_id = p.id WHERE qi.quote_id = ?`,
      [req.params.id]
    );
    res.json({ ...rows[0], items });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { contact_id, opportunity_id, items = [], notes, valid_until, discount, tax } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const number = await genNumber(req.user.tenant_id);
    let subtotal = 0;
    const processedItems = items.map(i => {
      const sub = i.quantity * i.unit_price * (1 - (i.discount_pct || 0) / 100);
      subtotal += sub;
      return { ...i, subtotal: sub };
    });
    const discountAmt = discount || 0;
    const taxAmt = tax || 0;
    const total = subtotal - discountAmt + taxAmt;
    const acceptToken = crypto.randomUUID();
    const [result] = await conn.query(
      `INSERT INTO quotes (tenant_id, number, contact_id, opportunity_id, subtotal, discount, tax, total, notes, valid_until, accept_token, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, number, contact_id || null, opportunity_id || null,
       subtotal, discountAmt, taxAmt, total, notes, valid_until || null, acceptToken, req.user.id]
    );
    for (const item of processedItems) {
      await conn.query(
        'INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, discount_pct, subtotal) VALUES (?,?,?,?,?,?,?)',
        [result.insertId, item.product_id || null, item.description, item.quantity, item.unit_price, item.discount_pct || 0, item.subtotal]
      );
    }
    await conn.commit();
    res.status(201).json({ id: result.insertId, number, accept_token: acceptToken });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally { conn.release(); }
};

const update = async (req, res) => {
  const { contact_id, opportunity_id, items = [], notes, valid_until, discount, tax } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let subtotal = 0;
    const processedItems = items.map(i => {
      const sub = i.quantity * i.unit_price * (1 - (i.discount_pct || 0) / 100);
      subtotal += sub;
      return { ...i, subtotal: sub };
    });
    const total = subtotal - (discount || 0) + (tax || 0);
    await conn.query(
      `UPDATE quotes SET contact_id=?, opportunity_id=?, subtotal=?, discount=?, tax=?, total=?, notes=?, valid_until=? 
       WHERE id=? AND tenant_id=?`,
      [contact_id || null, opportunity_id || null, subtotal, discount || 0, tax || 0, total, notes, valid_until || null, req.params.id, req.user.tenant_id]
    );
    await conn.query('DELETE FROM quote_items WHERE quote_id=?', [req.params.id]);
    for (const item of processedItems) {
      await conn.query(
        'INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, discount_pct, subtotal) VALUES (?,?,?,?,?,?,?)',
        [req.params.id, item.product_id || null, item.description, item.quantity, item.unit_price, item.discount_pct || 0, item.subtotal]
      );
    }
    await conn.commit();
    res.json({ message: 'Cotización actualizada' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally { conn.release(); }
};

const updateStatus = async (req, res) => {
  const { status } = req.body;
  try {
    await db.query('UPDATE quotes SET status=? WHERE id=? AND tenant_id=?',
      [status, req.params.id, req.user.tenant_id]);
    // Disparar automatización cuando se aprueba la cotización
    if (status === 'aprobada') {
      const [rows] = await db.query(
        'SELECT * FROM quotes WHERE id=? AND tenant_id=?',
        [req.params.id, req.user.tenant_id]
      );
      if (rows.length) {
        runAutomations('quote_approved', {
          tenant_id: req.user.tenant_id,
          user_id: req.user.id,
          record: rows[0],
        });
      }
    }
    res.json({ message: 'Estado actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── Funciones de aceptación pública (sin autenticación) ───
const getPublic = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT q.*, c.name as contact_name, c.email as contact_email, c.company as contact_company
       FROM quotes q LEFT JOIN contacts c ON q.contact_id = c.id
       WHERE q.accept_token = ?`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ message: 'Cotización no encontrada o enlace inválido' });
    const [items] = await db.query(
      `SELECT qi.*, p.name as product_name FROM quote_items qi
       LEFT JOIN products p ON qi.product_id = p.id WHERE qi.quote_id = ?`,
      [rows[0].id]
    );
    // No exponer datos internos
    const { tenant_id, created_by, accept_token, ...safe } = rows[0];
    res.json({ ...safe, items });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const acceptPublic = async (req, res) => {
  const { signer_name } = req.body;
  if (!signer_name) return res.status(400).json({ message: 'El nombre del firmante es requerido' });
  try {
    const [rows] = await db.query('SELECT * FROM quotes WHERE accept_token=?', [req.params.token]);
    if (!rows.length) return res.status(404).json({ message: 'Cotización no encontrada' });
    if (rows[0].status === 'aprobada') return res.status(400).json({ message: 'Esta cotización ya fue aceptada' });
    if (!['borrador','enviada'].includes(rows[0].status))
      return res.status(400).json({ message: 'No se puede aceptar en el estado actual' });

    const ip = req.ip || req.connection?.remoteAddress || '';
    const signedAt = new Date().toISOString();
    await db.query(
      `UPDATE quotes SET status='aprobada', signer_name=?, signer_ip=?, signed_at=? WHERE accept_token=?`,
      [signer_name, ip, signedAt, req.params.token]
    );

    // Disparar automatización
    runAutomations('quote_approved', {
      tenant_id: rows[0].tenant_id,
      user_id: rows[0].created_by,
      record: { ...rows[0], status: 'aprobada' },
    });

    res.json({ message: 'Cotización aceptada y firmada correctamente', signed_at: signedAt });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const rejectPublic = async (req, res) => {
  const { reason } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM quotes WHERE accept_token=?', [req.params.token]);
    if (!rows.length) return res.status(404).json({ message: 'Cotización no encontrada' });
    if (!['borrador','enviada'].includes(rows[0].status))
      return res.status(400).json({ message: 'No se puede rechazar en el estado actual' });

    await db.query(
      `UPDATE quotes SET status='rechazada', reject_reason=? WHERE accept_token=?`,
      [reason || '', req.params.token]
    );
    res.json({ message: 'Cotización rechazada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, getOne, create, update, updateStatus, getPublic, acceptPublic, rejectPublic };
