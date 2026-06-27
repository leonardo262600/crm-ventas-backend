const db = require('../config/db');

const list = async (req, res) => {
  const { search, category } = req.query;
  let sql = 'SELECT * FROM products WHERE tenant_id = ? AND active = 1';
  const params = [req.user.tenant_id];
  if (search)   { sql += ' AND (name LIKE ? OR sku LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY name';
  try {
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { sku, name, description, category, price, cost, stock, unit } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO products (tenant_id, sku, name, description, category, price, cost, stock, unit) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.user.tenant_id, sku, name, description, category, price || 0, cost || 0, stock || 0, unit || 'unidad']
    );
    res.status(201).json({ id: result.insertId, name });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { sku, name, description, category, price, cost, stock, unit, active } = req.body;
  try {
    await db.query(
      'UPDATE products SET sku=?,name=?,description=?,category=?,price=?,cost=?,stock=?,unit=?,active=? WHERE id=? AND tenant_id=?',
      [sku, name, description, category, price, cost, stock, unit, active ?? 1, req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Producto actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await db.query('UPDATE products SET active=0 WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Producto desactivado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, create, update, remove };
