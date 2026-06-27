const db = require('../config/db');

const list = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, u.name as created_by_name FROM automations a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.tenant_id = ? ORDER BY a.name`,
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config } = req.body;
  try {
    const [r] = await db.query(
      `INSERT INTO automations (tenant_id, name, trigger_type, trigger_config, action_type, action_config, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [req.user.tenant_id, name, trigger_type,
       JSON.stringify(trigger_config || {}),
       action_type,
       JSON.stringify(action_config || {}),
       req.user.id]
    );
    res.status(201).json({ id: r.insertId, name });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { name, trigger_type, trigger_config, action_type, action_config } = req.body;
  try {
    await db.query(
      `UPDATE automations SET name=?,trigger_type=?,trigger_config=?,action_type=?,action_config=?
       WHERE id=? AND tenant_id=?`,
      [name, trigger_type, JSON.stringify(trigger_config || {}),
       action_type, JSON.stringify(action_config || {}),
       req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const toggle = async (req, res) => {
  try {
    await db.query(
      'UPDATE automations SET active = NOT active WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Estado cambiado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await db.query('DELETE FROM automations WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Eliminado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, create, update, toggle, remove };
