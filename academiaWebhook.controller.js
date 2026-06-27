// ============================================================
// CRM: backend/src/controllers/academiaWebhook.controller.js
//
// NUEVO archivo — endpoint que recibe notificaciones de la Academia
// cuando alguien compra un curso online.
//
// Lógica:
//   1. Si el email ya existe como contacto → agregar tag "alumno-academia"
//      y registrar la compra en una nota (para que el vendedor no re-venda)
//   2. Si no existe → crear el contacto con source = "academia_online"
//   3. Crear/actualizar una oportunidad en estado "won" para que quede
//      en el historial del pipeline
// ============================================================

const db = require('./src/config/db');

const ACADEMIA_API_KEY = process.env.ACADEMIA_API_KEY || process.env.CRM_API_KEY;

// Middleware de autenticación por API Key (reutiliza el mismo patrón del ERP)
const requireApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!ACADEMIA_API_KEY) {
    console.warn('[Academia Webhook] ACADEMIA_API_KEY no configurado');
    return res.status(500).json({ message: 'API Key del servidor no configurada' });
  }
  if (key !== ACADEMIA_API_KEY) {
    return res.status(401).json({ message: 'API Key inválida' });
  }
  next();
};

/**
 * POST /api/contacts/from-academia
 * Body: { email, name, source, course_id, course_title, amount, purchase_id, tenant_id }
 */
const fromAcademia = async (req, res) => {
  const {
    email, name, course_id, course_title,
    amount, purchase_id, tenant_id
  } = req.body;

  if (!email) return res.status(400).json({ message: 'email es requerido' });

  // Usar tenant_id del body si viene, si no el del sistema (tenant 1 por defecto)
  const tid = parseInt(tenant_id) || 1;

  try {
    // ── 1. Buscar o crear el contacto ────────────────────────────────
    let [rows] = await db.query(
      'SELECT id, name, tags, notes FROM contacts WHERE email = ? AND tenant_id = ?',
      [email, tid]
    );

    let contactId;
    let esNuevo = false;

    if (rows.length) {
      // Contacto existente → agregar tag si no lo tiene ya
      contactId = rows[0].id;
      const tagsActuales = rows[0].tags ?? '';
      const nuevaNota    = `\n[Academia Online – ${new Date().toLocaleDateString('es-PE')}] Compró: "${course_title}" por $${amount}`;

      const tagsNuevos = tagsActuales.includes('alumno-academia')
        ? tagsActuales
        : [tagsActuales, 'alumno-academia'].filter(Boolean).join(',');

      await db.query(
        `UPDATE contacts
         SET tags  = ?,
             notes = CONCAT(COALESCE(notes,''), ?)
         WHERE id = ? AND tenant_id = ?`,
        [tagsNuevos, nuevaNota, contactId, tid]
      );
    } else {
      // Contacto nuevo: proviene de la academia online
      esNuevo = true;
      const [result] = await db.query(
        `INSERT INTO contacts (tenant_id, name, email, tags, notes, created_by)
         VALUES (?, ?, ?, 'alumno-academia', ?, 1)`,
        [
          tid,
          name ?? email.split('@')[0],
          email,
          `[Academia Online] Compró: "${course_title}" por $${amount} el ${new Date().toLocaleDateString('es-PE')}`
        ]
      );
      contactId = result.insertId;
    }

    // ── 2. Registrar la compra como oportunidad GANADA ────────────────
    // Así aparece en el pipeline y el vendedor ve que este producto ya fue vendido
    const [existingOpp] = await db.query(
      `SELECT id FROM opportunities
       WHERE contact_id = ? AND tenant_id = ?
         AND title LIKE ? AND status = 'won'`,
      [contactId, tid, `%${course_title}%`]
    );

    if (!existingOpp.length) {
      await db.query(
        `INSERT INTO opportunities
           (tenant_id, title, contact_id, amount, status, probability,
            description, created_by, close_date)
         VALUES (?, ?, ?, ?, 'won', 100, ?, 1, CURDATE())`,
        [
          tid,
          `[Academia] ${course_title}`,
          contactId,
          amount ?? 0,
          `Compra registrada automáticamente desde Academia Online.\nID de compra: ${purchase_id}\nCurso ID: ${course_id}`
        ]
      );
    }

    // ── 3. Log en erp_sync_log para trazabilidad ─────────────────────
    await db.query(
      `INSERT INTO erp_sync_log
         (tenant_id, opportunity_id, contact_email, status, error_message)
       SELECT ?, id, ?, 'ok', ?
       FROM opportunities
       WHERE contact_id = ? AND tenant_id = ? AND title LIKE ?
       ORDER BY id DESC LIMIT 1`,
      [tid, email, `Academia: ${course_title}`, contactId, tid, `%${course_title}%`]
    ).catch(() => {}); // no crítico si falla

    return res.status(200).json({
      message:   esNuevo ? 'Contacto creado desde academia' : 'Contacto actualizado',
      contactId,
      isNew:     esNuevo
    });

  } catch (err) {
    console.error('[Academia Webhook] Error:', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { fromAcademia, requireApiKey };