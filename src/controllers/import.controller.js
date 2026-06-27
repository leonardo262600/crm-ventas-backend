const db = require('../config/db');

const importContacts = async (req, res) => {
  const { rows } = req.body; // [{name,email,phone,company,position,tags}]
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ message: 'Sin datos para importar' });

  const conn = await db.getConnection();
  let inserted = 0, skipped = 0;
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      if (!row.name?.trim()) { skipped++; continue; }
      try {
        await conn.query(
          `INSERT INTO contacts (tenant_id, name, email, phone, company, position, tags, created_by)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE phone=VALUES(phone), company=VALUES(company)`,
          [req.user.tenant_id, row.name.trim(), row.email?.trim()||null,
           row.phone?.trim()||null, row.company?.trim()||null,
           row.position?.trim()||null, row.tags?.trim()||null, req.user.id]
        );
        inserted++;
      } catch { skipped++; }
    }
    await conn.commit();
    res.json({ inserted, skipped, total: rows.length });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally { conn.release(); }
};

module.exports = { importContacts };
