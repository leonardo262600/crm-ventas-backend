const bcrypt = require('bcryptjs');
const db = require('../config/db');

const getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, tenant_id, avatar, created_at FROM users WHERE id=?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateProfile = async (req, res) => {
  const { name, email } = req.body;
  try {
    await db.query('UPDATE users SET name=?, email=? WHERE id=?', [name, email, req.user.id]);
    res.json({ message: 'Perfil actualizado', name, email });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ message: 'Faltan datos' });
  if (new_password.length < 6)
    return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id=?', [req.user.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password);
    if (!valid) return res.status(400).json({ message: 'Contraseña actual incorrecta' });
    const hashed = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password=? WHERE id=?', [hashed, req.user.id]);

    await db.query(
      "INSERT INTO audit_logs (tenant_id, user_id, action) VALUES (?,?,'change_password')",
      [req.user.tenant_id, req.user.id]
    );
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getStats = async (req, res) => {
  try {
    const [[counts]] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM opportunities WHERE assigned_to=? AND status='open')     as open_opps,
        (SELECT COUNT(*) FROM opportunities WHERE assigned_to=? AND status='won')      as won_opps,
        (SELECT COALESCE(SUM(amount),0) FROM opportunities WHERE assigned_to=? AND status='won') as revenue,
        (SELECT COUNT(*) FROM activities WHERE assigned_to=? AND status='pendiente')   as pending_acts,
        (SELECT COUNT(*) FROM contacts WHERE assigned_to=?)                            as contacts`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );
    res.json(counts);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getProfile, updateProfile, changePassword, getStats };
