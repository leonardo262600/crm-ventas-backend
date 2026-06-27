const db = require('../config/db');
const { runAutomations } = require('../services/automations.service');

const list = async (req, res) => {
  const { status, type, contact_id, opportunity_id, from, to } = req.query;
  let sql = `SELECT a.*, u.name as assigned_name, c.name as contact_name, o.title as opp_title
             FROM activities a
             LEFT JOIN users u ON a.assigned_to = u.id
             LEFT JOIN contacts c ON a.contact_id = c.id
             LEFT JOIN opportunities o ON a.opportunity_id = o.id
             WHERE a.tenant_id = ?`;
  const params = [req.user.tenant_id];
  if (status)       { sql += ' AND a.status = ?'; params.push(status); }
  if (type)         { sql += ' AND a.type = ?'; params.push(type); }
  if (contact_id)   { sql += ' AND a.contact_id = ?'; params.push(contact_id); }
  if (opportunity_id){ sql += ' AND a.opportunity_id = ?'; params.push(opportunity_id); }
  if (from)         { sql += ' AND a.scheduled_at >= ?'; params.push(from); }
  if (to)           { sql += ' AND a.scheduled_at <= ?'; params.push(to); }
  sql += ' ORDER BY a.scheduled_at ASC';
  try {
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { title, type, description, scheduled_at, due_at, contact_id, opportunity_id, assigned_to } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO activities (tenant_id, title, type, description, scheduled_at, due_at, contact_id, opportunity_id, assigned_to, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, title, type || 'tarea', description, scheduled_at || null,
       due_at || null, contact_id || null, opportunity_id || null, assigned_to || req.user.id, req.user.id]
    );
    res.status(201).json({ id: result.insertId, title });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { title, type, description, scheduled_at, due_at, status, contact_id, opportunity_id, assigned_to } = req.body;
  try {
    await db.query(
      `UPDATE activities SET title=?,type=?,description=?,scheduled_at=?,due_at=?,status=?,
       contact_id=?,opportunity_id=?,assigned_to=? WHERE id=? AND tenant_id=?`,
      [title, type, description, scheduled_at || null, due_at || null, status || 'pendiente',
       contact_id || null, opportunity_id || null, assigned_to || null, req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Actividad actualizada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const complete = async (req, res) => {
  try {
    await db.query("UPDATE activities SET status='completada' WHERE id=? AND tenant_id=?",
      [req.params.id, req.user.tenant_id]);

    // Disparar automatización activity_due con datos completos de la actividad
    const [rows] = await db.query(
      `SELECT a.*, c.name as contact_name, o.title as opp_title
       FROM activities a
       LEFT JOIN contacts c ON a.contact_id = c.id
       LEFT JOIN opportunities o ON a.opportunity_id = o.id
       WHERE a.id = ? AND a.tenant_id = ?`,
      [req.params.id, req.user.tenant_id]
    );
    if (rows.length) {
      runAutomations('activity_due', {
        tenant_id: req.user.tenant_id,
        user_id: req.user.id,
        record: rows[0],
      });
    }

    res.json({ message: 'Actividad completada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await db.query('DELETE FROM activities WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Actividad eliminada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, create, update, complete, remove };
