
const db = require('../config/db');
const { runAutomations } = require('../services/automations.service');
const { crearAlumnoEnERP } = require('../services/erp.service'); // Integración ERP avanzada

const list = async (req, res) => {
  const { stage_id, status, assigned_to } = req.query;
  let sql = `SELECT o.*, ps.name as stage_name, ps.color as stage_color,
             c.name as contact_name, u.name as assigned_name
             FROM opportunities o
             LEFT JOIN pipeline_stages ps ON o.stage_id = ps.id
             LEFT JOIN contacts c ON o.contact_id = c.id
             LEFT JOIN users u ON o.assigned_to = u.id
             WHERE o.tenant_id = ?`;
  const params = [req.user.tenant_id];
  if (stage_id)   { sql += ' AND o.stage_id = ?'; params.push(stage_id); }
  if (status)     { sql += ' AND o.status = ?'; params.push(status); }
  if (assigned_to){ sql += ' AND o.assigned_to = ?'; params.push(assigned_to); }
  sql += ' ORDER BY o.created_at DESC';
  try {
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const stages = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM pipeline_stages WHERE tenant_id = ? ORDER BY order_index',
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT o.*, ps.name as stage_name, c.name as contact_name, u.name as assigned_name
       FROM opportunities o
       LEFT JOIN pipeline_stages ps ON o.stage_id = ps.id
       LEFT JOIN contacts c ON o.contact_id = c.id
       LEFT JOIN users u ON o.assigned_to = u.id
       WHERE o.id = ? AND o.tenant_id = ?`,
      [req.params.id, req.user.tenant_id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Oportunidad no encontrada' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { title, contact_id, stage_id, amount, probability, close_date, assigned_to, description } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO opportunities (tenant_id, title, contact_id, stage_id, amount, probability, close_date, assigned_to, description, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.tenant_id, title, contact_id || null, stage_id || null, amount || 0,
       probability || 0, close_date || null, assigned_to || null, description, req.user.id]
    );
    runAutomations('opportunity_created', {
      tenant_id: req.user.tenant_id, user_id: req.user.id,
      record: { id: result.insertId, title, contact_id, stage_id, amount, assigned_to }
    });
    res.status(201).json({ id: result.insertId, title });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { title, contact_id, stage_id, amount, probability, close_date, assigned_to, description, status } = req.body;
  try {
    await db.query(
      `UPDATE opportunities SET title=?,contact_id=?,stage_id=?,amount=?,probability=?,
       close_date=?,assigned_to=?,description=?,status=? WHERE id=? AND tenant_id=?`,
      [title, contact_id || null, stage_id || null, amount || 0, probability || 0,
       close_date || null, assigned_to || null, description, status || 'open', req.params.id, req.user.tenant_id]
    );
    res.json({ message: 'Oportunidad actualizada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const moveStage = async (req, res) => {
  const { stage_id } = req.body;
  try {
    await db.query('UPDATE opportunities SET stage_id=? WHERE id=? AND tenant_id=?',
      [stage_id, req.params.id, req.user.tenant_id]);
    // Trigger automatizaciones de cambio de etapa
    const [rows] = await db.query('SELECT * FROM opportunities WHERE id=?', [req.params.id]);
    if (rows.length) {
      runAutomations('opportunity_stage_changed', {
        tenant_id: req.user.tenant_id, user_id: req.user.id,
        record: { ...rows[0], stage_id }
      });
    }
    res.json({ message: 'Etapa actualizada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};


const updateStatus = async (req, res) => {
  const { status, amount, close_date, lost_reason } = req.body;
  try {
    // 1. Actualizar la oportunidad en la BD del CRM (sin cambios)
    let sql = 'UPDATE opportunities SET status=?';
    const params = [status];

    if (amount !== undefined) { sql += ', amount=?'; params.push(amount); }
    if (close_date !== undefined) { sql += ', close_date=?'; params.push(close_date); }
    if (lost_reason) {
      sql += ', description=CONCAT(COALESCE(description,""), ?)';
      params.push(`\n\n[Motivo de pérdida]: ${lost_reason}`);
    }
    sql += ' WHERE id=? AND tenant_id=?';
    params.push(req.params.id, req.user.tenant_id);

    await db.query(sql, params);

    // 2. NUEVO: si la venta se cierra como GANADA → crear alumno en el ERP
    if (status === 'won') {
      // Obtener la oportunidad con los datos del contacto
      const [rows] = await db.query(
        `SELECT o.*, c.name as contact_name, c.email as contact_email,
                c.phone as contact_phone, c.id as contact_id_real
         FROM opportunities o
         LEFT JOIN contacts c ON o.contact_id = c.id
         WHERE o.id = ? AND o.tenant_id = ?`,
        [req.params.id, req.user.tenant_id]
      );

      if (rows.length && rows[0].contact_email) {
        const oportunidad = rows[0];
        const contacto = {
          id:    oportunidad.contact_id_real,
          name:  oportunidad.contact_name,
          email: oportunidad.contact_email,
          phone: oportunidad.contact_phone
        };

        // Llamada al ERP — no bloqueante: si falla, la venta igual se registra
        crearAlumnoEnERP(oportunidad, contacto)
          .then(resultado => {
            if (!resultado.ok) {
              console.error(`[ERP] No se pudo crear el alumno para oportunidad ${req.params.id}: ${resultado.error}`);
              // Aquí podrías guardar en una tabla "erp_pending" para reintentar
            }
          })
          .catch(err => console.error('[ERP] Error inesperado:', err.message));

      } else {
        console.warn(`[ERP] Oportunidad ${req.params.id} marcada como ganada pero el contacto no tiene email. Alumno no creado.`);
      }

      // Disparar automatizaciones de "venta ganada"
      runAutomations('opportunity_won', {
        tenant_id: req.user.tenant_id,
        user_id:   req.user.id,
        record:    { id: parseInt(req.params.id), status, amount }
      });
    }

    res.json({ message: 'Estado de oportunidad actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const forecast = async (req, res) => {
  const tid = req.user.tenant_id;
  try {
    // Pronóstico por mes (próximos 6 meses) usando close_date y probability
    const [byMonth] = await db.query(
      `SELECT
         DATE_FORMAT(close_date,'%Y-%m') as month,
         COUNT(*) as count,
         SUM(amount) as total_amount,
         SUM(amount * probability / 100) as weighted_amount
       FROM opportunities
       WHERE tenant_id=? AND status='open' AND close_date >= CURDATE()
         AND close_date <= DATE_ADD(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month`,
      [tid]
    );
    // Por etapa
    const [byStage] = await db.query(
      `SELECT ps.name as stage, ps.color, COUNT(o.id) as count,
              COALESCE(SUM(o.amount),0) as total,
              COALESCE(SUM(o.amount * o.probability/100),0) as weighted,
              AVG(o.probability) as avg_prob
       FROM pipeline_stages ps
       LEFT JOIN opportunities o ON o.stage_id=ps.id AND o.tenant_id=? AND o.status='open'
       WHERE ps.tenant_id=? GROUP BY ps.id ORDER BY ps.order_index`,
      [tid, tid]
    );
    // Totales globales
    const [[totals]] = await db.query(
      `SELECT
         COUNT(*) as total_open,
         COALESCE(SUM(amount),0) as pipeline_total,
         COALESCE(SUM(amount * probability/100),0) as weighted_total,
         AVG(probability) as avg_probability
       FROM opportunities WHERE tenant_id=? AND status='open'`,
      [tid]
    );
    // Oportunidades próximas a cerrar (30 días)
    const [closing_soon] = await db.query(
      `SELECT o.*, c.name as contact_name, ps.name as stage_name, u.name as assigned_name
       FROM opportunities o
       LEFT JOIN contacts c ON o.contact_id=c.id
       LEFT JOIN pipeline_stages ps ON o.stage_id=ps.id
       LEFT JOIN users u ON o.assigned_to=u.id
       WHERE o.tenant_id=? AND o.status='open'
         AND o.close_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       ORDER BY o.close_date ASC LIMIT 10`,
      [tid]
    );
    res.json({ byMonth, byStage, totals, closing_soon });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await db.query('DELETE FROM opportunities WHERE id=? AND tenant_id=?',
      [req.params.id, req.user.tenant_id]);
    res.json({ message: 'Oportunidad eliminada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { list, stages, getOne, create, update, moveStage, updateStatus, forecast, remove };
