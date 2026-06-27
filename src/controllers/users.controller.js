const bcrypt = require('bcryptjs');
const db = require('../config/db');

const list = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, active, created_at FROM users WHERE tenant_id = ? ORDER BY name',
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (tenant_id, name, email, password, role) VALUES (?,?,?,?,?)',
      [req.user.tenant_id, name, email, hashed, role || 'vendedor']
    );
    res.status(201).json({ id: result.insertId, name, email, role });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { name, email, role, active } = req.body;
  try {
    await db.query(
      'UPDATE users SET name=?, email=?, role=?, active=? WHERE id=? AND tenant_id=?',
      [name, email, role, active, req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Usuario actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await db.query('UPDATE users SET active=0 WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Usuario desactivado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, create, update, remove };
