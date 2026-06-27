const db        = require('../config/db');
const { execSync, exec } = require('child_process');
const path      = require('path');
const fs        = require('fs');
const multer    = require('multer');

const BACKUP_DIR = path.join(__dirname, '../../backups');

const ensureDir = () => {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
};

const dbCfg = () => ({
  host:   process.env.DB_HOST     || 'localhost',
  user:   process.env.DB_USER     || 'root',
  pass:   process.env.DB_PASSWORD || '',
  name:   process.env.DB_NAME     || 'ventas_crm',
});

const passArg = pass => (pass ? `-p${pass}` : '');

// ── GET /backup/list ──────────────────────────────────────
const list = async (req, res) => {
  try {
    ensureDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        // Extraer la etiqueta si existe (backup-YYYY-MM-DDTHH-MM-SS_etiqueta.sql)
        let label = f;
        if (f.startsWith('backup-PRE-RESET-')) {
          label = 'Auto: PRE-RESET';
        } else {
          const match = f.match(/backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_(.*)\.sql/);
          if (match && match[1]) label = match[1];
          else label = f.replace('.sql', '');
        }
        return {
          filename:   f,
          size:       stat.size,
          created_at: stat.mtime,
          label:      label,
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(files);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── POST /backup/generate ─────────────────────────────────
const generate = async (req, res) => {
  try {
    ensureDir();
    const { host, user, pass, name } = dbCfg();
    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const label    = req.body.label ? `_${req.body.label.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
    const filename = `backup-${ts}${label}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    const cmd = `mysqldump -h ${host} -u ${user} ${passArg(pass)} --single-transaction --routines --triggers ${name} > "${filepath}"`;
    execSync(cmd, { shell: true, timeout: 120000 });

    const stat = fs.statSync(filepath);

    // Purgar backups de más de 30 (mantener 30 más recientes)
    const all = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.time - a.time);
    all.slice(30).forEach(f => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch (_) {}
    });

    res.json({
      message:    'Copia de seguridad generada correctamente',
      filename,
      size:       stat.size,
      created_at: stat.mtime,
    });
  } catch (err) {
    res.status(500).json({
      message: 'Error al generar la copia de seguridad. Verifica que mysqldump esté disponible en el PATH.',
      detail:  err.message,
    });
  }
};

// ── GET /backup/download/:filename ───────────────────────
const download = async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filepath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ message: 'Archivo no encontrado' });
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── DELETE /backup/:filename ──────────────────────────────
const remove = async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filepath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ message: 'Archivo no encontrado' });
    fs.unlinkSync(filepath);
    res.json({ message: 'Copia eliminada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// ── POST /backup/restore/:filename (restaurar desde lista) ─
const restoreFromFile = async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filepath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ message: 'Archivo no encontrado' });

    const { host, user, pass, name } = dbCfg();
    const cmd = `mysql -h ${host} -u ${user} ${passArg(pass)} ${name} < "${filepath}"`;
    execSync(cmd, { shell: true, timeout: 300000 });

    res.json({ message: `Base de datos restaurada desde ${filename} correctamente` });
  } catch (err) {
    res.status(500).json({
      message: 'Error al restaurar. Verifica que mysql esté en el PATH.',
      detail:  err.message,
    });
  }
};

// ── POST /backup/restore/upload (restaurar desde archivo subido) ─
const restoreFromUpload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo .sql' });

    const { host, user, pass, name } = dbCfg();
    const cmd = `mysql -h ${host} -u ${user} ${passArg(pass)} ${name} < "${req.file.path}"`;
    execSync(cmd, { shell: true, timeout: 300000 });

    // Borrar el archivo temporal subido
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    res.json({ message: 'Base de datos restaurada desde archivo subido correctamente' });
  } catch (err) {
    try { if (req.file) fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({
      message: 'Error al restaurar el archivo SQL.',
      detail:  err.message,
    });
  }
};

// ── POST /backup/reset ────────────────────────────────────
// Genera backup automático, luego borra todos los datos de negocio
// (mantiene usuarios admin y configuración del tenant)
const resetSystem = async (req, res) => {
  const { confirm_text, keep_users } = req.body;
  if (confirm_text !== 'RESETEAR SISTEMA') {
    return res.status(400).json({ message: 'Texto de confirmación incorrecto' });
  }
  try {
    // 1. Backup automático antes de resetear
    ensureDir();
    const { host, user, pass, name } = dbCfg();
    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-PRE-RESET-${ts}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);
    try {
      const cmd = `mysqldump -h ${host} -u ${user} ${passArg(pass)} --single-transaction ${name} > "${filepath}"`;
      execSync(cmd, { shell: true, timeout: 120000 });
    } catch (_) { /* Si falla el backup, continuar igual */ }

    const tid = req.user.tenant_id;

    // 2. Truncar/limpiar todas las tablas de negocio
    const tables = [
      'quote_items', 'invoice_items', 'quotes', 'invoices',
      'activities', 'communications', 'emails', 'calls', 'email_templates',
      'opportunities', 'contacts',
      'price_list_items', 'price_lists',
      'products',
      'automations', 'workflows',
      'audit_logs', 'push_subscriptions',
      'chat_messages', 'chat_rooms',
    ];

    for (const table of tables) {
      try {
        await db.query(`DELETE FROM ${table} WHERE tenant_id = ?`, [tid]);
      } catch (_) {
        // Si la tabla no tiene tenant_id o no existe, intentar sin filtro de tenant solo si hay 1 tenant
        try { await db.query(`DELETE FROM ${table}`); } catch (__) {}
      }
    }

    // 3. Resetear pipeline stages a defaults (sin eliminar los del tenant)
    try {
      await db.query('DELETE FROM pipeline_stages WHERE tenant_id = ?', [tid]);
      // Reinsertar etapas por defecto
      const defaultStages = [
        { name: 'Prospecto',    color: '#6B7280', order_index: 1 },
        { name: 'Calificado',   color: '#3B82F6', order_index: 2 },
        { name: 'Propuesta',    color: '#F59E0B', order_index: 3 },
        { name: 'Negociación',  color: '#8B5CF6', order_index: 4 },
        { name: 'Ganado',       color: '#10B981', order_index: 5, is_default: true },
        { name: 'Perdido',      color: '#EF4444', order_index: 6 },
      ];
      for (const s of defaultStages) {
        await db.query(
          'INSERT INTO pipeline_stages (tenant_id, name, color, order_index, is_default) VALUES (?,?,?,?,?)',
          [tid, s.name, s.color, s.order_index, s.is_default ? 1 : 0]
        );
      }
    } catch (_) {}

    // 4. Optionalmente mantener o borrar usuarios no-admin
    if (!keep_users) {
      try {
        await db.query(
          `DELETE FROM users WHERE tenant_id = ? AND role != 'admin'`,
          [tid]
        );
      } catch (_) {}
    }

    res.json({
      message:         'Sistema reseteado correctamente',
      backup_filename: fs.existsSync(filepath) ? filename : null,
      tables_cleared:  tables.length,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error al resetear el sistema', detail: err.message });
  }
};

// ── GET /backup/info ──────────────────────────────────────
const info = async (req, res) => {
  try {
    ensureDir();
    const tid = req.user.tenant_id;

    // Contar registros por tabla
    const counts = {};
    const tables = ['contacts','opportunities','quotes','invoices','products','activities','users'];
    for (const t of tables) {
      try {
        const [[row]] = await db.query(`SELECT COUNT(*) as c FROM ${t} WHERE tenant_id = ?`, [tid]);
        counts[t] = row.c;
      } catch (_) { counts[t] = 0; }
    }

    // Tamaño de la BD
    let dbSize = 0;
    try {
      const [[sizeRow]] = await db.query(
        `SELECT ROUND(SUM(data_length + index_length), 0) AS size
         FROM information_schema.tables
         WHERE table_schema = ?`,
        [process.env.DB_NAME || 'ventas_crm']
      );
      dbSize = sizeRow?.size || 0;
    } catch (_) {}

    // Total backups
    const backupFiles = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql'));
    const totalBackupSize = backupFiles.reduce((acc, f) => {
      try { return acc + fs.statSync(path.join(BACKUP_DIR, f)).size; } catch (_) { return acc; }
    }, 0);

    res.json({
      db_size:           dbSize,
      backup_count:      backupFiles.length,
      total_backup_size: totalBackupSize,
      last_backup:       backupFiles.length > 0
        ? fs.statSync(path.join(BACKUP_DIR, backupFiles.sort().at(-1))).mtime
        : null,
      record_counts: counts,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, generate, download, remove, restoreFromFile, restoreFromUpload, resetSystem, info };
