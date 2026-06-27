const db = require('../config/db');

const dashboard = async (req, res) => {
  const tid = req.user.tenant_id;
  const { from, to } = req.query; // Filtros de rango de fechas opcionales
  const dateFilter = from && to ? ` AND created_at BETWEEN '${from}' AND '${to} 23:59:59'` : '';
  const dateFilterA = from && to ? ` AND scheduled_at BETWEEN '${from}' AND '${to} 23:59:59'` : '';

  try {
    const [[{ total_contacts }]] = await db.query(
      `SELECT COUNT(*) as total_contacts FROM contacts WHERE tenant_id=?${dateFilter}`, [tid]);
    const [[{ total_opportunities }]] = await db.query(
      `SELECT COUNT(*) as total_opportunities FROM opportunities WHERE tenant_id=? AND status='open'${dateFilter}`, [tid]);
    const [[{ total_activities }]] = await db.query(
      `SELECT COUNT(*) as total_activities FROM activities WHERE tenant_id=? AND status='pendiente'${dateFilterA}`, [tid]);
    const [[{ total_users }]] = await db.query(
      'SELECT COUNT(*) as total_users FROM users WHERE tenant_id=? AND active=1', [tid]);
    const [[{ revenue_won }]] = await db.query(
      `SELECT COALESCE(SUM(amount),0) as revenue_won FROM opportunities WHERE tenant_id=? AND status='won'${dateFilter}`, [tid]);
    const [[{ pipeline_value }]] = await db.query(
      `SELECT COALESCE(SUM(amount),0) as pipeline_value FROM opportunities WHERE tenant_id=? AND status='open'${dateFilter}`, [tid]);

    // Oportunidades por mes (últimos 12 meses o dentro del rango)
    const monthlyWhere = from && to
      ? `WHERE tenant_id=? AND created_at BETWEEN '${from}' AND '${to} 23:59:59'`
      : `WHERE tenant_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`;
    const [monthly] = await db.query(
      `SELECT DATE_FORMAT(created_at,'%Y-%m') as month, COUNT(*) as count, COALESCE(SUM(amount),0) as amount
       FROM opportunities ${monthlyWhere} GROUP BY month ORDER BY month`,
      [tid]
    );

    // Pipeline por etapa
    const [pipeline] = await db.query(
      `SELECT ps.name, ps.color, COUNT(o.id) as count, COALESCE(SUM(o.amount),0) as amount
       FROM pipeline_stages ps
       LEFT JOIN opportunities o ON o.stage_id = ps.id AND o.tenant_id=? AND o.status='open'
       WHERE ps.tenant_id=? GROUP BY ps.id ORDER BY ps.order_index`,
      [tid, tid]
    );

    // Top vendedores
    const [top_sellers] = await db.query(
      `SELECT u.name, COUNT(o.id) as opportunities, COALESCE(SUM(o.amount),0) as total_amount
       FROM users u LEFT JOIN opportunities o ON o.assigned_to=u.id AND o.tenant_id=? AND o.status='won'${dateFilter}
       WHERE u.tenant_id=? AND u.active=1 GROUP BY u.id ORDER BY total_amount DESC LIMIT 5`,
      [tid, tid]
    );

    // Actividades próximas (7 días)
    const [upcoming] = await db.query(
      `SELECT a.*, c.name as contact_name FROM activities a
       LEFT JOIN contacts c ON a.contact_id=c.id
       WHERE a.tenant_id=? AND a.status='pendiente' AND a.scheduled_at BETWEEN NOW() AND DATE_ADD(NOW(),INTERVAL 7 DAY)
       ORDER BY a.scheduled_at ASC LIMIT 10`,
      [tid]
    );

    res.json({
      stats: { total_contacts, total_opportunities, total_activities, total_users, revenue_won, pipeline_value },
      monthly, pipeline, top_sellers, upcoming,
      filters: { from: from || null, to: to || null },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const salesFunnel = async (req, res) => {
  const tid = req.user.tenant_id;
  try {
    const [rows] = await db.query(
      `SELECT ps.name, ps.color, COUNT(o.id) as count, COALESCE(SUM(o.amount),0) as amount
       FROM pipeline_stages ps
       LEFT JOIN opportunities o ON o.stage_id = ps.id AND o.tenant_id=?
       WHERE ps.tenant_id=? GROUP BY ps.id ORDER BY ps.order_index`,
      [tid, tid]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { dashboard, salesFunnel };
