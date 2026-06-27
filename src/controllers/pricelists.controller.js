const db = require('../config/db');

const list = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT pl.*,
         COALESCE((SELECT COUNT(*) FROM price_list_items pli WHERE pli.price_list_id=pl.id), 0) as item_count
       FROM price_lists pl
       WHERE pl.tenant_id=? AND pl.active=1
       ORDER BY pl.name`,
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM price_lists WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Lista no encontrada' });
    const [items] = await db.query(
      `SELECT pli.*, p.name as product_name, p.sku, p.price as base_price
       FROM price_list_items pli
       JOIN products p ON pli.product_id = p.id
       WHERE pli.price_list_id = ?`,
      [req.params.id]
    );
    res.json({ ...rows[0], items });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { name, description, currency, discount_pct } = req.body;
  if (!name) return res.status(400).json({ message: 'Nombre requerido' });
  try {
    const [r] = await db.query(
      `INSERT INTO price_lists (tenant_id, name, description, currency, discount_pct)
       VALUES (?,?,?,?,?)`,
      [req.user.tenant_id, name, description || null, currency || 'MXN', discount_pct || 0]
    );
    res.status(201).json({ id: r.insertId, name });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { name, description, currency, discount_pct, active } = req.body;
  try {
    await db.query(
      `UPDATE price_lists
       SET name=?, description=?, currency=?, discount_pct=?, active=?
       WHERE id=? AND tenant_id=?`,
      [name, description || null, currency || 'MXN', discount_pct ?? 0, active ?? 1,
       req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await db.query('UPDATE price_lists SET active=0 WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Eliminado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const setItem = async (req, res) => {
  const { product_id, price, volume_tiers } = req.body;
  if (!product_id || price === undefined)
    return res.status(400).json({ message: 'product_id y price requeridos' });
  try {
    const tiersJson = volume_tiers ? JSON.stringify(volume_tiers) : null;
    await db.query(
      `INSERT INTO price_list_items (price_list_id, product_id, price, volume_tiers)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE price = VALUES(price), volume_tiers = VALUES(volume_tiers)`,
      [req.params.id, product_id, price, tiersJson]
    );
    res.json({ message: 'Precio establecido' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const removeItem = async (req, res) => {
  try {
    await db.query(
      'DELETE FROM price_list_items WHERE price_list_id=? AND product_id=?',
      [req.params.id, req.params.product_id]
    );
    res.json({ message: 'Eliminado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/**
 * Calcula el precio final aplicando escalones de volumen.
 * GET /price-lists/:id/calc?product_id=X&quantity=Y
 */
const calcVolumePrice = async (req, res) => {
  const { product_id, quantity = 1 } = req.query;
  if (!product_id) return res.status(400).json({ message: 'product_id requerido' });
  try {
    const [rows] = await db.query(
      'SELECT price, volume_tiers FROM price_list_items WHERE price_list_id=? AND product_id=?',
      [req.params.id, product_id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Producto no en esta lista' });

    const { price, volume_tiers } = rows[0];
    const qty   = Number(quantity) || 1;
    let tiers   = [];
    try { tiers = volume_tiers ? JSON.parse(volume_tiers) : []; } catch { tiers = []; }

    // Encontrar el escalón más alto que aplique
    const applicable = tiers
      .filter(t => qty >= Number(t.min_qty))
      .sort((a, b) => b.min_qty - a.min_qty);

    const discount_pct = applicable.length ? Number(applicable[0].discount_pct) : 0;
    const final_price  = price * (1 - discount_pct / 100);

    res.json({ base_price: price, quantity: qty, discount_pct, final_price, applied_tier: applicable[0] || null });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, getOne, create, update, remove, setItem, removeItem, calcVolumePrice };
