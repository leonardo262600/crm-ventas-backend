const db   = require('../config/db');
const path = require('path');
const fs   = require('fs');

// ── Asegurar que la tabla tenga todas las columnas ─────────
const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_settings (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id        INT NOT NULL UNIQUE,
      company_name     VARCHAR(200),
      company_email    VARCHAR(200),
      company_phone    VARCHAR(50),
      company_address  TEXT,
      company_website  VARCHAR(200),
      company_ruc      VARCHAR(30),
      company_industry VARCHAR(100),
      company_country  VARCHAR(100),
      company_city     VARCHAR(100),
      logo_url         TEXT,
      currency         VARCHAR(10)  DEFAULT 'PEN',
      currency_symbol  VARCHAR(10)  DEFAULT 'S/',
      currency_position VARCHAR(10) DEFAULT 'before',
      tax_name         VARCHAR(50)  DEFAULT 'IGV',
      tax_rate         DECIMAL(5,2) DEFAULT 18.00,
      tax_enabled      TINYINT(1)   DEFAULT 1,
      decimal_separator VARCHAR(1)  DEFAULT '.',
      thousands_separator VARCHAR(1) DEFAULT ',',
      date_format      VARCHAR(30)  DEFAULT 'DD/MM/YYYY',
      smtp_host        VARCHAR(200),
      smtp_port        VARCHAR(10)  DEFAULT '587',
      smtp_secure      TINYINT(1)  DEFAULT 0,
      smtp_user        VARCHAR(200),
      smtp_pass        VARCHAR(200),
      smtp_from        VARCHAR(200),
      quote_footer     TEXT,
      quote_notes      TEXT,
      quote_validity_days INT DEFAULT 30,
      invoice_prefix   VARCHAR(20)  DEFAULT 'FAC-',
      quote_prefix     VARCHAR(20)  DEFAULT 'COT-',
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Agregar columnas nuevas si la tabla ya existía (migraciones seguras)
  const newCols = [
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS company_industry VARCHAR(100)",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS company_country  VARCHAR(100)",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS company_city     VARCHAR(100)",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS currency_position VARCHAR(10) DEFAULT 'before'",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS tax_name         VARCHAR(50)  DEFAULT 'IGV'",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS tax_rate         DECIMAL(5,2) DEFAULT 18.00",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS tax_enabled      TINYINT(1)   DEFAULT 1",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS decimal_separator VARCHAR(1)  DEFAULT '.'",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS thousands_separator VARCHAR(1) DEFAULT ','",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS date_format      VARCHAR(30)  DEFAULT 'DD/MM/YYYY'",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS quote_notes      TEXT",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS quote_validity_days INT DEFAULT 30",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS invoice_prefix   VARCHAR(20)  DEFAULT 'FAC-'",
    "ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS quote_prefix     VARCHAR(20)  DEFAULT 'COT-'",
  ];
  for (const sql of newCols) {
    try { await db.query(sql); } catch (_) { /* columna ya existe */ }
  }
};

// ── GET /settings ──────────────────────────────────────────
const getSettings = async (req, res) => {
  try {
    await ensureTable();
    const [rows] = await db.query(
      'SELECT * FROM tenant_settings WHERE tenant_id = ? LIMIT 1',
      [req.user.tenant_id]
    );
    if (!rows.length) {
      return res.json(defaults());
    }
    const { smtp_pass, ...safe } = rows[0];
    res.json({ ...safe, smtp_pass_set: !!smtp_pass });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── PUT /settings ──────────────────────────────────────────
const saveSettings = async (req, res) => {
  try {
    await ensureTable();
    const {
      company_name, company_email, company_phone, company_address,
      company_website, company_ruc, company_industry, company_country, company_city,
      currency, currency_symbol, currency_position,
      tax_name, tax_rate, tax_enabled,
      decimal_separator, thousands_separator, date_format,
      smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from,
      quote_footer, quote_notes, quote_validity_days,
      invoice_prefix, quote_prefix,
      logo_url,
    } = req.body;

    const fields = {
      company_name, company_email, company_phone, company_address,
      company_website, company_ruc, company_industry, company_country, company_city,
      currency, currency_symbol, currency_position,
      tax_name, tax_rate: parseFloat(tax_rate) || 0,
      tax_enabled: tax_enabled ? 1 : 0,
      decimal_separator, thousands_separator, date_format,
      smtp_host, smtp_port,
      smtp_secure: smtp_secure ? 1 : 0,
      smtp_user, smtp_from,
      quote_footer, quote_notes,
      quote_validity_days: parseInt(quote_validity_days) || 30,
      invoice_prefix, quote_prefix,
    };

    // Actualizar logo si se envía URL
    if (logo_url !== undefined) fields.logo_url = logo_url;

    // Solo actualizar smtp_pass si se envía uno nuevo
    if (smtp_pass && smtp_pass !== '••••••••') {
      fields.smtp_pass = smtp_pass;
    }

    // Limpiar valores undefined
    Object.keys(fields).forEach(k => fields[k] === undefined && delete fields[k]);

    const setClause = Object.keys(fields).map(k => `${k}=?`).join(', ');
    const values    = Object.values(fields);

    await db.query(
      `INSERT INTO tenant_settings (tenant_id, ${Object.keys(fields).join(', ')})
       VALUES (?, ${Object.keys(fields).map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${setClause}`,
      [req.user.tenant_id, ...values, ...values]
    );

    // Sincronizar SMTP en memoria
    if (smtp_host)    process.env.SMTP_HOST    = smtp_host;
    if (smtp_port)    process.env.SMTP_PORT    = smtp_port;
    if (smtp_user)    process.env.SMTP_USER    = smtp_user;
    if (smtp_from)    process.env.SMTP_FROM    = smtp_from;
    if (smtp_pass && smtp_pass !== '••••••••') process.env.SMTP_PASS = smtp_pass;
    if (smtp_secure !== undefined) process.env.SMTP_SECURE = String(smtp_secure);

    res.json({ message: 'Configuración guardada correctamente' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── POST /settings/logo  (multipart upload) ───────────────
const uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

    // La URL pública del logo
    const logoUrl = `/uploads/logos/${req.file.filename}`;

    // Guardar en la base de datos
    await ensureTable();
    await db.query(
      `INSERT INTO tenant_settings (tenant_id, logo_url)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE logo_url = ?`,
      [req.user.tenant_id, logoUrl, logoUrl]
    );

    res.json({ logo_url: logoUrl, message: 'Logo actualizado correctamente' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── DELETE /settings/logo ─────────────────────────────────
const deleteLogo = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT logo_url FROM tenant_settings WHERE tenant_id = ? LIMIT 1',
      [req.user.tenant_id]
    );
    if (rows.length && rows[0].logo_url) {
      const filePath = path.join(__dirname, '../../public', rows[0].logo_url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.query(
      'UPDATE tenant_settings SET logo_url = NULL WHERE tenant_id = ?',
      [req.user.tenant_id]
    );
    res.json({ message: 'Logo eliminado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

function defaults() {
  return {
    company_name: '', company_email: '', company_phone: '',
    company_address: '', company_website: '', company_ruc: '',
    company_industry: '', company_country: '', company_city: '',
    logo_url: '',
    currency: 'PEN', currency_symbol: 'S/', currency_position: 'before',
    tax_name: 'IGV', tax_rate: 18, tax_enabled: true,
    decimal_separator: '.', thousands_separator: ',',
    date_format: 'DD/MM/YYYY',
    smtp_host: '', smtp_port: '587', smtp_secure: false,
    smtp_user: '', smtp_from: '', smtp_pass_set: false,
    quote_footer: '', quote_notes: '', quote_validity_days: 30,
    invoice_prefix: 'FAC-', quote_prefix: 'COT-',
  };
}

module.exports = { getSettings, saveSettings, uploadLogo, deleteLogo };
