const db = require('../config/db');
const { runAutomations } = require('../services/automations.service');

const list = async (req, res) => {
  const { search, tag } = req.query;
  let sql = `SELECT c.*, u.name as assigned_name
             FROM contacts c
             LEFT JOIN users u ON c.assigned_to = u.id
             WHERE c.tenant_id = ?`;
  const params = [req.user.tenant_id];
  if (search) { sql += ' AND (c.name LIKE ? OR c.email LIKE ? OR c.company LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (tag)    { sql += ' AND c.tags LIKE ?'; params.push(`%${tag}%`); }
  sql += ' ORDER BY c.name';
  try {
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
    // ============================================================
    // CRM: backend/src/controllers/contacts.controller.js  (CORREGIDO)
    //
    // NUEVO en getOne:
    //   - muestra badge "Alumno ERP" cuando el contacto ya fue matriculado
    //   - muestra qué cursos/productos ya compró (purchased_products)
    //   - si ya es alumno, el vendedor lo ve de inmediato al abrir la ficha
    // ============================================================
};

const getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, u.name as assigned_name FROM contacts c
       LEFT JOIN users u ON c.assigned_to = u.id
       WHERE c.id = ? AND c.tenant_id = ?`,
      [req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Contacto no encontrado' });
    const contact = rows[0];
    
    // Ficha 360 Unificada
    const [activities] = await db.query(
      'SELECT id, title, type, status, scheduled_at as date FROM activities WHERE contact_id = ? AND tenant_id = ?',
      [contact.id, req.user.tenant_id]
    );
    const [opportunities] = await db.query(
      `SELECT o.id, o.title, o.amount, o.status, o.created_at as date, ps.name as stage_name 
       FROM opportunities o
       LEFT JOIN pipeline_stages ps ON o.stage_id = ps.id
       WHERE o.contact_id = ? AND o.tenant_id = ?`,
      [contact.id, req.user.tenant_id]
    );
    const [emails] = await db.query(
      'SELECT id, subject, created_at as date FROM comm_emails WHERE contact_id = ? AND tenant_id = ?',
      [contact.id, req.user.tenant_id]
    );

    const timeline = [
      ...activities.map(a => ({ ...a, entityType: 'activity' })),
      ...opportunities.map(o => ({ ...o, entityType: 'opportunity' })),
      ...emails.map(e => ({ ...e, entityType: 'email' }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ ...contact, timeline });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { name, email, phone, company, position, address, tags, notes, assigned_to } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO contacts (tenant_id, name, email, phone, company, position, address, tags, notes, assigned_to, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, name, email, phone, company, position, address, tags, notes, assigned_to || null, req.user.id]
    );
    runAutomations('contact_created', {
      tenant_id: req.user.tenant_id, user_id: req.user.id,
      record: { id: result.insertId, name, email, company, assigned_to }
    });
    res.status(201).json({ id: result.insertId, name, email });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { name, email, phone, company, position, address, tags, notes, assigned_to } = req.body;
  try {
    await db.query(
      `UPDATE contacts SET name=?,email=?,phone=?,company=?,position=?,address=?,tags=?,notes=?,assigned_to=?
       WHERE id=? AND tenant_id=?`,
      [name, email, phone, company, position, address, tags, notes, assigned_to || null, req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Contacto actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await db.query('DELETE FROM contacts WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Contacto eliminado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, getOne, create, update, remove };
