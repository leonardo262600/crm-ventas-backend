const db = require('../config/db');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const auditLog = async (req, res) => {
  const { limit = 100 } = req.query;
  try {
    const [rows] = await db.query(
      `SELECT al.*, u.name as user_name FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.tenant_id = ? ORDER BY al.created_at DESC LIMIT ?`,
      [req.user.tenant_id, Number(limit)]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const stats = async (req, res) => {
  const tid = req.user.tenant_id;
  try {
    const [[totals]] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id=? AND active=1) as users,
        (SELECT COUNT(*) FROM contacts WHERE tenant_id=?) as contacts,
        (SELECT COUNT(*) FROM opportunities WHERE tenant_id=?) as opportunities,
        (SELECT COUNT(*) FROM products WHERE tenant_id=? AND active=1) as products,
        (SELECT COUNT(*) FROM quotes WHERE tenant_id=?) as quotes,
        (SELECT COUNT(*) FROM activities WHERE tenant_id=?) as activities`,
      [tid, tid, tid, tid, tid, tid]
    );
    res.json(totals);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── Configuración de la empresa (tenant settings) ─────────
const getSettings = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM tenant_settings WHERE tenant_id = ? LIMIT 1',
      [req.user.tenant_id]
    );
    if (!rows.length) {
      // Devolver defaults si no existe registro
      return res.json({
        company_name: '', company_email: '', company_phone: '',
        company_address: '', company_website: '', company_ruc: '',
        smtp_host: '', smtp_port: '587', smtp_secure: false,
        smtp_user: '', smtp_from: '',
        currency: 'PEN', currency_symbol: 'S/',
        quote_footer: '', logo_url: '',
      });
    }
    const s = rows[0];
    // No exponer smtp_pass por seguridad
    const { smtp_pass, ...safe } = s;
    res.json({ ...safe, smtp_pass_set: !!smtp_pass });
  } catch (err) {
    // Si la tabla no existe aún, devuelve defaults
    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.json({
        company_name: '', company_email: '', smtp_host: '', smtp_port: '587',
        smtp_secure: false, smtp_user: '', smtp_from: '',
        currency: 'PEN', currency_symbol: 'S/', quote_footer: '',
      });
    }
    res.status(500).json({ message: err.message });
  }
};

const saveSettings = async (req, res) => {
  const {
    company_name, company_email, company_phone, company_address,
    company_website, company_ruc, smtp_host, smtp_port, smtp_secure,
    smtp_user, smtp_pass, smtp_from, currency, currency_symbol,
    quote_footer, logo_url,
  } = req.body;
  try {
    // Crear tabla si no existe
    await db.query(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL UNIQUE,
        company_name VARCHAR(200),
        company_email VARCHAR(200),
        company_phone VARCHAR(50),
        company_address TEXT,
        company_website VARCHAR(200),
        company_ruc VARCHAR(20),
        smtp_host VARCHAR(200),
        smtp_port VARCHAR(10) DEFAULT '587',
        smtp_secure TINYINT(1) DEFAULT 0,
        smtp_user VARCHAR(200),
        smtp_pass VARCHAR(200),
        smtp_from VARCHAR(200),
        currency VARCHAR(10) DEFAULT 'PEN',
        currency_symbol VARCHAR(5) DEFAULT 'S/',
        quote_footer TEXT,
        logo_url TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Upsert
    const fields = {
      company_name, company_email, company_phone, company_address,
      company_website, company_ruc, smtp_host, smtp_port,
      smtp_secure: smtp_secure ? 1 : 0, smtp_user, smtp_from,
      currency, currency_symbol, quote_footer, logo_url,
    };
    // Solo actualizar smtp_pass si se envía uno nuevo
    if (smtp_pass && smtp_pass !== '••••••••') {
      fields.smtp_pass = smtp_pass;
    }

    const setClause = Object.keys(fields).map(k => `${k}=?`).join(', ');
    const values = Object.values(fields);

    await db.query(
      `INSERT INTO tenant_settings (tenant_id, ${Object.keys(fields).join(', ')})
       VALUES (?, ${Object.keys(fields).map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${setClause}`,
      [req.user.tenant_id, ...values, ...values]
    );

    // Actualizar variables de entorno SMTP en memoria (efecto inmediato)
    if (smtp_host) process.env.SMTP_HOST = smtp_host;
    if (smtp_port) process.env.SMTP_PORT = smtp_port;
    if (smtp_user) process.env.SMTP_USER = smtp_user;
    if (smtp_pass && smtp_pass !== '••••••••') process.env.SMTP_PASS = smtp_pass;
    if (smtp_from) process.env.SMTP_FROM = smtp_from;
    if (smtp_secure !== undefined) process.env.SMTP_SECURE = String(smtp_secure);

    res.json({ message: 'Configuración guardada correctamente' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── Backup de base de datos ───────────────────────────────
const runBackup = async (req, res) => {
  try {
    const backupDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-${ts}.sql`;
    const filepath = path.join(backupDir, filename);

    const host     = process.env.DB_HOST || 'localhost';
    const user     = process.env.DB_USER || 'root';
    const pass     = process.env.DB_PASSWORD || '';
    const dbName   = process.env.DB_NAME || 'ventas_crm';

    const passArg  = pass ? `-p${pass}` : '';
    const cmd      = `mysqldump -h ${host} -u ${user} ${passArg} ${dbName} > "${filepath}"`;

    execSync(cmd, { shell: true });

    // Limpiar backups > 7 días
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.sql'))
      .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtime }))
      .sort((a, b) => b.time - a.time);

    files.slice(14).forEach(f => fs.unlinkSync(path.join(backupDir, f.name)));

    res.json({
      message: 'Backup realizado correctamente',
      filename,
      size: fs.statSync(filepath).size,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      message: 'Error al ejecutar el backup. Verifica que mysqldump esté disponible en el PATH.',
      detail: err.message,
    });
  }
};

const listBackups = async (req, res) => {
  try {
    const backupDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(backupDir)) return res.json([]);

    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const stat = fs.statSync(path.join(backupDir, f));
        return { filename: f, size: stat.size, created_at: stat.mtime };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(files);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const downloadBackup = async (req, res) => {
  try {
    const backupDir = path.join(__dirname, '../../backups');
    const filename  = path.basename(req.params.filename); // sanitize
    const filepath  = path.join(backupDir, filename);

    if (!fs.existsSync(filepath)) return res.status(404).json({ message: 'Archivo no encontrado' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── Pipeline stages ───────────────────────────────────────
const getStages = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM pipeline_stages WHERE tenant_id=? ORDER BY order_index',
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const createStage = async (req, res) => {
  const { name, color, order_index } = req.body;
  try {
    const [r] = await db.query(
      'INSERT INTO pipeline_stages (tenant_id, name, color, order_index) VALUES (?,?,?,?)',
      [req.user.tenant_id, name, color || '#3B82F6', order_index || 0]
    );
    res.status(201).json({ id: r.insertId, name });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateStage = async (req, res) => {
  const { name, color, order_index } = req.body;
  try {
    await db.query(
      'UPDATE pipeline_stages SET name=?,color=?,order_index=? WHERE id=? AND tenant_id=?',
      [name, color, order_index, req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Etapa actualizada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const deleteStage = async (req, res) => {
  try {
    await db.query('DELETE FROM pipeline_stages WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Etapa eliminada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = {
  auditLog, stats,
  getSettings, saveSettings,
  runBackup, listBackups, downloadBackup,
  getStages, createStage, updateStage, deleteStage,
};
