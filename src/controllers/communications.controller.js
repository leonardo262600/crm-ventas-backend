const db = require('../config/db');
const { sendMail } = require('../services/email.service');

// ─── Emails ───────────────────────────────────────────────
const listEmails = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*, c.name as contact_name, u.name as user_name
       FROM comm_emails e
       LEFT JOIN contacts c ON e.contact_id = c.id
       LEFT JOIN users u ON e.user_id = u.id
       WHERE e.tenant_id = ? ORDER BY e.created_at DESC`,
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const createEmail = async (req, res) => {
  const { contact_id, subject, body } = req.body;
  try {
    const [r] = await db.query(
      'INSERT INTO comm_emails (tenant_id, contact_id, subject, body, user_id) VALUES (?,?,?,?,?)',
      [req.user.tenant_id, contact_id || null, subject, body, req.user.id]
    );
    // Intentar envío real si el contacto tiene email
    if (contact_id) {
      const [contacts] = await db.query('SELECT email FROM contacts WHERE id=?', [contact_id]);
      if (contacts.length && contacts[0].email) {
        sendMail({ to: contacts[0].email, subject, html: body })
          .catch(err => console.error('[Email] Error de envío:', err.message));
      }
    }
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Llamadas ─────────────────────────────────────────────
const listCalls = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, ct.name as contact_name, u.name as user_name
       FROM comm_calls c
       LEFT JOIN contacts ct ON c.contact_id = ct.id
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.tenant_id = ? ORDER BY c.called_at DESC`,
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const createCall = async (req, res) => {
  const { contact_id, direction, duration, notes, called_at } = req.body;
  try {
    const [r] = await db.query(
      'INSERT INTO comm_calls (tenant_id, contact_id, direction, duration, notes, called_at, user_id) VALUES (?,?,?,?,?,?,?)',
      [req.user.tenant_id, contact_id || null, direction || 'outbound',
       duration || null, notes, called_at || null, req.user.id]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ─── Plantillas ───────────────────────────────────────────
const listTemplates = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM comm_templates WHERE tenant_id = ? ORDER BY name',
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const createTemplate = async (req, res) => {
  const { name, subject, body } = req.body;
  try {
    const [r] = await db.query(
      'INSERT INTO comm_templates (tenant_id, name, subject, body, created_by) VALUES (?,?,?,?,?)',
      [req.user.tenant_id, name, subject, body, req.user.id]
    );
    res.status(201).json({ id: r.insertId, name });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateTemplate = async (req, res) => {
  const { name, subject, body } = req.body;
  try {
    await db.query(
      'UPDATE comm_templates SET name=?,subject=?,body=? WHERE id=? AND tenant_id=?',
      [name, subject, body, req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const deleteTemplate = async (req, res) => {
  try {
    await db.query('DELETE FROM comm_templates WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Eliminado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { listEmails, createEmail, listCalls, createCall, listTemplates, createTemplate, updateTemplate, deleteTemplate };
