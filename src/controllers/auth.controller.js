const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');

const login = async (req, res) => {
  const { email, password, tfa_token } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email y contraseña requeridos' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ? AND active = 1', [email]
    );
    if (!rows.length)
      return res.status(401).json({ message: 'Credenciales inválidas' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ message: 'Credenciales inválidas' });

    // Verificación 2FA
    if (user.tfa_enabled) {
      if (!tfa_token) {
        return res.status(206).json({ require_2fa: true, message: 'Se requiere código 2FA' });
      }
      const isValid2FA = authenticator.check(tfa_token, user.tfa_secret);
      if (!isValid2FA) {
        return res.status(401).json({ message: 'Código 2FA inválido' });
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    await db.query(
      "INSERT INTO audit_logs (tenant_id, user_id, action, details) VALUES (?,?,'login',?)",
      [user.tenant_id, user.id, JSON.stringify({ email })]
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant_id: user.tenant_id }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error del servidor', error: err.message });
  }
};

const me = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, tenant_id, avatar, tfa_enabled, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = rows[0];
    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(400).json({ message: 'Contraseña actual incorrecta' });
    const hashed = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── 2FA ───────────────────────────────────────────────────

const setup2FA = async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    // Obtener info del tenant
    const [tenantRows] = await db.query('SELECT company_name FROM tenant_settings WHERE tenant_id = ?', [req.user.tenant_id]);
    const issuer = tenantRows.length && tenantRows[0].company_name ? tenantRows[0].company_name : 'CRMyERP';
    const otpauth = authenticator.keyuri(req.user.email, issuer, secret);
    
    qrcode.toDataURL(otpauth, (err, imageUrl) => {
      if (err) throw err;
      res.json({ secret, qr_code: imageUrl });
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const enable2FA = async (req, res) => {
  const { secret, token } = req.body;
  try {
    const isValid = authenticator.check(token, secret);
    if (!isValid) return res.status(400).json({ message: 'El código ingresado es incorrecto' });
    
    await db.query('UPDATE users SET tfa_secret = ?, tfa_enabled = 1 WHERE id = ?', [secret, req.user.id]);
    res.json({ message: 'Autenticación de dos factores activada exitosamente' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const disable2FA = async (req, res) => {
  try {
    await db.query('UPDATE users SET tfa_secret = NULL, tfa_enabled = 0 WHERE id = ?', [req.user.id]);
    res.json({ message: 'Autenticación de dos factores desactivada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { login, me, changePassword, setup2FA, enable2FA, disable2FA };

