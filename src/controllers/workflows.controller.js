const db = require('../config/db');

const list = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT w.*, u.name as created_by_name FROM workflows w
       LEFT JOIN users u ON w.created_by = u.id
       WHERE w.tenant_id = ? ORDER BY w.created_at DESC`,
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM workflows WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
    if (!rows.length) return res.status(404).json({ message: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { name, trigger_type, nodes_json, edges_json } = req.body;
  try {
    const [r] = await db.query(
      `INSERT INTO workflows (tenant_id, name, trigger_type, nodes_json, edges_json, created_by)
       VALUES (?,?,?,?,?,?)`,
      [req.user.tenant_id, name, trigger_type,
       JSON.stringify(nodes_json || []),
       JSON.stringify(edges_json || []),
       req.user.id]
    );
    res.status(201).json({ id: r.insertId, name });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { name, trigger_type, nodes_json, edges_json } = req.body;
  try {
    await db.query(
      `UPDATE workflows SET name=?,trigger_type=?,nodes_json=?,edges_json=?
       WHERE id=? AND tenant_id=?`,
      [name, trigger_type,
       JSON.stringify(nodes_json || []),
       JSON.stringify(edges_json || []),
       req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const toggle = async (req, res) => {
  try {
    await db.query(
      'UPDATE workflows SET active = NOT active WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Estado cambiado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await db.query('DELETE FROM workflows WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Eliminado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, getOne, create, update, toggle, remove };
