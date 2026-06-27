const db = require('../config/db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// ── Excel: Contactos ─────────────────────────────────────
const exportContactsExcel = async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.name, c.email, c.phone, c.company, c.position, c.tags,
            u.name as assigned_to, c.created_at
     FROM contacts c LEFT JOIN users u ON c.assigned_to = u.id
     WHERE c.tenant_id = ? ORDER BY c.name`,
    [req.user.tenant_id]
  );
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Contactos');
  ws.columns = [
    { header: 'Nombre', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    { header: 'Empresa', key: 'company', width: 22 },
    { header: 'Cargo', key: 'position', width: 20 },
    { header: 'Etiquetas', key: 'tags', width: 20 },
    { header: 'Asignado a', key: 'assigned_to', width: 20 },
    { header: 'Fecha creación', key: 'created_at', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rows.forEach(r => ws.addRow(r));
  ws.eachRow((row, i) => { if (i > 1) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } }; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=contactos.xlsx');
  await wb.xlsx.write(res);
  res.end();
};

// ── Excel: Oportunidades ─────────────────────────────────
const exportOppsExcel = async (req, res) => {
  const [rows] = await db.query(
    `SELECT o.title, c.name as contact, ps.name as stage, o.amount,
            o.probability, o.close_date, o.status, u.name as assigned_to, o.created_at
     FROM opportunities o
     LEFT JOIN contacts c ON o.contact_id = c.id
     LEFT JOIN pipeline_stages ps ON o.stage_id = ps.id
     LEFT JOIN users u ON o.assigned_to = u.id
     WHERE o.tenant_id = ? ORDER BY o.created_at DESC`,
    [req.user.tenant_id]
  );
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Oportunidades');
  ws.columns = [
    { header: 'Título', key: 'title', width: 30 },
    { header: 'Contacto', key: 'contact', width: 22 },
    { header: 'Etapa', key: 'stage', width: 18 },
    { header: 'Monto', key: 'amount', width: 14 },
    { header: 'Probabilidad %', key: 'probability', width: 16 },
    { header: 'Cierre', key: 'close_date', width: 14 },
    { header: 'Estado', key: 'status', width: 12 },
    { header: 'Asignado a', key: 'assigned_to', width: 20 },
    { header: 'Creado', key: 'created_at', width: 18 },
  ];
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rows.forEach(r => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=oportunidades.xlsx');
  await wb.xlsx.write(res);
  res.end();
};

// ── PDF: Cotización ───────────────────────────────────────
const exportQuotePDF = async (req, res) => {
  const tid = req.user.tenant_id;
  const [qRows] = await db.query(
    `SELECT q.*, c.name as contact_name, c.email as contact_email, c.company as contact_company
     FROM quotes q LEFT JOIN contacts c ON q.contact_id = c.id
     WHERE q.id = ? AND q.tenant_id = ?`,
    [req.params.id, tid]
  );
  if (!qRows.length) return res.status(404).json({ message: 'Cotización no encontrada' });
  const q = qRows[0];
  const [items] = await db.query(
    `SELECT qi.*, p.name as product_name FROM quote_items qi
     LEFT JOIN products p ON qi.product_id = p.id WHERE qi.quote_id = ?`,
    [q.id]
  );
  const [tenantRows] = await db.query('SELECT name FROM tenants WHERE id = ?', [tid]);
  const tenantName = tenantRows[0]?.name || 'Mi Empresa';

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=cotizacion-${q.number}.pdf`);
  doc.pipe(res);

  // Header
  doc.rect(0, 0, 612, 80).fill('#0f766e');
  doc.fontSize(22).fillColor('white').font('Helvetica-Bold').text('COTIZACIÓN', 50, 25);
  doc.fontSize(11).font('Helvetica').text(tenantName, 50, 52);
  doc.fontSize(14).fillColor('white').text(q.number, 420, 35, { align: 'right', width: 142 });

  // Client info
  doc.moveDown(2).fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('CLIENTE:', 50, 100);
  doc.font('Helvetica').fontSize(10).fillColor('#334155')
    .text(q.contact_name || '—', 50, 115)
    .text(q.contact_company || '', 50, 128)
    .text(q.contact_email || '', 50, 141);

  // Quote meta
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e293b').text('FECHA:', 380, 100);
  doc.font('Helvetica').fillColor('#334155').text(new Date(q.created_at).toLocaleDateString('es-PE'), 380, 113);
  if (q.valid_until) {
    doc.font('Helvetica-Bold').fillColor('#1e293b').text('VÁLIDA HASTA:', 380, 128);
    doc.font('Helvetica').fillColor('#334155').text(new Date(q.valid_until).toLocaleDateString('es-PE'), 380, 141);
  }

  // Items table header
  const tY = 175;
  doc.rect(50, tY, 512, 22).fill('#f1f5f9');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569')
    .text('DESCRIPCIÓN', 55, tY + 7)
    .text('CANT.', 320, tY + 7)
    .text('PRECIO', 365, tY + 7)
    .text('DESC%', 420, tY + 7)
    .text('SUBTOTAL', 470, tY + 7);

  let y = tY + 30;
  items.forEach((item, i) => {
    if (i % 2 === 0) doc.rect(50, y - 5, 512, 20).fill('#fafafa');
    doc.fontSize(9).font('Helvetica').fillColor('#334155')
      .text(item.description || item.product_name || '—', 55, y, { width: 255 })
      .text(String(item.quantity), 320, y)
      .text(`S/ ${Number(item.unit_price).toFixed(2)}`, 365, y)
      .text(`${item.discount_pct || 0}%`, 420, y)
      .text(`S/ ${Number(item.subtotal).toFixed(2)}`, 470, y);
    y += 22;
  });

  // Totals
  y += 10;
  doc.moveTo(50, y).lineTo(562, y).strokeColor('#e2e8f0').lineWidth(1).stroke();
  y += 12;
  const totals = [
    ['Subtotal:', `S/ ${Number(q.subtotal).toFixed(2)}`],
    ['Descuento:', `S/ ${Number(q.discount).toFixed(2)}`],
    ['Impuesto:', `S/ ${Number(q.tax).toFixed(2)}`],
  ];
  totals.forEach(([label, val]) => {
    doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(label, 400, y).text(val, 490, y, { align: 'right', width: 72 });
    y += 16;
  });
  doc.rect(395, y, 167, 24).fill('#0f766e');
  doc.fontSize(11).font('Helvetica-Bold').fillColor('white')
    .text('TOTAL:', 400, y + 7)
    .text(`S/ ${Number(q.total).toFixed(2)}`, 490, y + 7, { align: 'right', width: 72 });

  // Notes
  if (q.notes) {
    y += 40;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#475569').text('NOTAS:', 50, y);
    doc.font('Helvetica').fillColor('#64748b').text(q.notes, 50, y + 14, { width: 512 });
  }

  // Footer
  doc.fontSize(8).fillColor('#94a3b8').text('Documento generado por CRM Ventas', 50, 780, { align: 'center', width: 512 });
  doc.end();
};

// ── PDF: Reporte General ─────────────────────────────
const exportReportPDF = async (req, res) => {
  const tid = req.user.tenant_id;
  const { from, to } = req.query;
  const dateLabel = from && to ? `${from} al ${to}` : `Últimos 12 meses`;
  const dateFilter = from && to ? `AND created_at BETWEEN '${from}' AND '${to} 23:59:59'` : `AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)`;

  const [[{ total_contacts }]] = await db.query(
    `SELECT COUNT(*) as total_contacts FROM contacts WHERE tenant_id=?`, [tid]);
  const [[{ total_opportunities }]] = await db.query(
    `SELECT COUNT(*) as total_opportunities FROM opportunities WHERE tenant_id=? AND status='open'`, [tid]);
  const [[{ revenue_won }]] = await db.query(
    `SELECT COALESCE(SUM(amount),0) as revenue_won FROM opportunities WHERE tenant_id=? AND status='won' ${dateFilter}`, [tid]);
  const [[{ pipeline_value }]] = await db.query(
    `SELECT COALESCE(SUM(amount),0) as pipeline_value FROM opportunities WHERE tenant_id=? AND status='open'`, [tid]);

  const [pipeline] = await db.query(
    `SELECT ps.name as etapa, ps.color, COUNT(o.id) as oportunidades, COALESCE(SUM(o.amount),0) as monto
     FROM pipeline_stages ps LEFT JOIN opportunities o ON o.stage_id=ps.id AND o.tenant_id=? AND o.status='open'
     WHERE ps.tenant_id=? GROUP BY ps.id ORDER BY ps.order_index`,
    [tid, tid]
  );
  const [sellers] = await db.query(
    `SELECT u.name as vendedor, COUNT(o.id) as ganadas, COALESCE(SUM(o.amount),0) as total
     FROM users u LEFT JOIN opportunities o ON o.assigned_to=u.id AND o.tenant_id=? AND o.status='won' ${dateFilter}
     WHERE u.tenant_id=? GROUP BY u.id ORDER BY total DESC LIMIT 10`,
    [tid, tid]
  );
  const [monthly] = await db.query(
    `SELECT DATE_FORMAT(created_at,'%Y-%m') as mes, COUNT(*) as oportunidades, COALESCE(SUM(amount),0) as monto
     FROM opportunities WHERE tenant_id=? ${dateFilter} GROUP BY mes ORDER BY mes`,
    [tid]
  );

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=reporte-crm-${Date.now()}.pdf`);
  doc.pipe(res);

  const green  = '#0f766e';
  const dark   = '#1e293b';
  const gray   = '#64748b';
  const light  = '#f8fafc';
  const W      = 512; // usable width

  // ── Encabezado ──
  doc.rect(0, 0, 612, 80).fill(green);
  doc.fontSize(22).font('Helvetica-Bold').fillColor('white').text('Reporte de Ventas', 50, 20);
  doc.fontSize(10).font('Helvetica').fillColor('rgba(255,255,255,0.85)').text(`CRM Ventas • Período: ${dateLabel}`, 50, 48);
  doc.fontSize(9).fillColor('rgba(255,255,255,0.7)').text(`Generado: ${new Date().toLocaleString('es-PE')}`, 50, 62);

  let y = 100;

  // ── KPIs ──
  doc.fontSize(13).font('Helvetica-Bold').fillColor(dark).text('Resumen General', 50, y); y += 20;
  const kpis = [
    { label: 'Ingresos ganados', value: `S/ ${Number(revenue_won).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, color: '#10B981' },
    { label: 'Pipeline activo',  value: `S/ ${Number(pipeline_value).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`, color: '#3B82F6' },
    { label: 'Oportunidades abiertas', value: String(total_opportunities), color: '#8B5CF6' },
    { label: 'Total contactos',  value: String(total_contacts), color: '#F59E0B' },
  ];
  const kpiW = Math.floor(W / 4) - 4;
  kpis.forEach((k, i) => {
    const x = 50 + i * (kpiW + 5);
    doc.rect(x, y, kpiW, 54).fill(light);
    doc.rect(x, y, kpiW, 4).fill(k.color);
    doc.fontSize(16).font('Helvetica-Bold').fillColor(k.color).text(k.value, x + 6, y + 12, { width: kpiW - 12, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor(gray).text(k.label, x + 4, y + 36, { width: kpiW - 8, align: 'center' });
  });
  y += 70;

  // ── Pipeline por etapa ──
  doc.fontSize(13).font('Helvetica-Bold').fillColor(dark).text('Pipeline por Etapa', 50, y); y += 16;
  const colPW = [200, 100, 120, 92];
  const pHeaders = ['Etapa', 'Oportunidades', 'Monto (PEN)', '% del total'];
  const totalPMonto = pipeline.reduce((s, r) => s + Number(r.monto), 0);

  // Header row
  doc.rect(50, y, W, 18).fill(green);
  let cx = 50;
  pHeaders.forEach((h, i) => {
    doc.fontSize(9).font('Helvetica-Bold').fillColor('white').text(h, cx + 4, y + 4, { width: colPW[i] - 8 });
    cx += colPW[i];
  });
  y += 18;

  pipeline.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? 'white' : light;
    doc.rect(50, y, W, 18).fill(bg);
    const pct = totalPMonto ? ((Number(row.monto) / totalPMonto) * 100).toFixed(1) : '0.0';
    const vals = [row.etapa, row.oportunidades, `S/ ${Number(row.monto).toLocaleString('es-PE', { minimumFractionDigits: 0 })}`, `${pct}%`];
    cx = 50;
    vals.forEach((v, i) => {
      doc.fontSize(9).font('Helvetica').fillColor(dark).text(String(v), cx + 4, y + 4, { width: colPW[i] - 8 });
      cx += colPW[i];
    });
    y += 18;
  });
  y += 16;

  // ── Tendencia mensual ──
  if (monthly.length) {
    doc.fontSize(13).font('Helvetica-Bold').fillColor(dark).text('Oportunidades por Mes', 50, y); y += 16;
    const colMW = [100, 120, 160, 132];
    const mHeaders = ['Mes', 'Oportunidades', 'Monto (PEN)', ''];
    doc.rect(50, y, W, 18).fill(green);
    cx = 50;
    mHeaders.forEach((h, i) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('white').text(h, cx + 4, y + 4, { width: colMW[i] - 8 });
      cx += colMW[i];
    });
    y += 18;

    const maxMonto = Math.max(...monthly.map(m => Number(m.monto)), 1);
    monthly.forEach((row, ri) => {
      if (y > 740) { doc.addPage(); y = 50; }
      const bg = ri % 2 === 0 ? 'white' : light;
      doc.rect(50, y, W, 18).fill(bg);
      const barW = Math.round((Number(row.monto) / maxMonto) * 124);
      cx = 50;
      doc.fontSize(9).font('Helvetica').fillColor(dark).text(row.mes, cx + 4, y + 4, { width: colMW[0] - 8 }); cx += colMW[0];
      doc.fontSize(9).fillColor(dark).text(String(row.oportunidades), cx + 4, y + 4, { width: colMW[1] - 8 }); cx += colMW[1];
      doc.fontSize(9).fillColor(dark).text(`S/ ${Number(row.monto).toLocaleString('es-PE', { minimumFractionDigits: 0 })}`, cx + 4, y + 4, { width: colMW[2] - 8 }); cx += colMW[2];
      if (barW > 0) doc.rect(cx + 4, y + 5, barW, 8).fill('#0f766e');
      y += 18;
    });
    y += 16;
  }

  // ── Top Vendedores ──
  if (sellers.length) {
    if (y > 640) { doc.addPage(); y = 50; }
    doc.fontSize(13).font('Helvetica-Bold').fillColor(dark).text('Ranking de Vendedores', 50, y); y += 16;
    const colSW = [220, 100, 192];
    const sHeaders = ['Vendedor', 'Ventas ganadas', 'Total (PEN)'];
    doc.rect(50, y, W, 18).fill(green);
    cx = 50;
    sHeaders.forEach((h, i) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('white').text(h, cx + 4, y + 4, { width: colSW[i] - 8 });
      cx += colSW[i];
    });
    y += 18;
    sellers.forEach((row, ri) => {
      const bg = ri % 2 === 0 ? 'white' : light;
      doc.rect(50, y, W, 18).fill(bg);
      cx = 50;
      const vals = [row.vendedor, row.ganadas, `S/ ${Number(row.total).toLocaleString('es-PE', { minimumFractionDigits: 0 })}`];
      vals.forEach((v, i) => {
        doc.fontSize(9).font(ri === 0 ? 'Helvetica-Bold' : 'Helvetica').fillColor(ri === 0 ? green : dark)
           .text(String(v), cx + 4, y + 4, { width: colSW[i] - 8 });
        cx += colSW[i];
      });
      y += 18;
    });
  }

  // Footer
  const pageCount = doc.bufferedPageRange ? doc.bufferedPageRange().count : 1;
  doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
     .text('Generado por CRM Ventas • Confidencial', 50, 780, { align: 'center', width: W });

  doc.end();
};


// ── Excel: Reporte general ────────────────────────────────
const exportReportExcel = async (req, res) => {
  const tid = req.user.tenant_id;
  const [monthly] = await db.query(
    `SELECT DATE_FORMAT(created_at,'%Y-%m') as mes, COUNT(*) as oportunidades, COALESCE(SUM(amount),0) as monto
     FROM opportunities WHERE tenant_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
     GROUP BY mes ORDER BY mes`,
    [tid]
  );
  const [pipeline] = await db.query(
    `SELECT ps.name as etapa, COUNT(o.id) as oportunidades, COALESCE(SUM(o.amount),0) as monto
     FROM pipeline_stages ps LEFT JOIN opportunities o ON o.stage_id=ps.id AND o.tenant_id=? AND o.status='open'
     WHERE ps.tenant_id=? GROUP BY ps.id ORDER BY ps.order_index`,
    [tid, tid]
  );
  const [sellers] = await db.query(
    `SELECT u.name as vendedor, COUNT(o.id) as ganadas, COALESCE(SUM(o.amount),0) as total
     FROM users u LEFT JOIN opportunities o ON o.assigned_to=u.id AND o.tenant_id=? AND o.status='won'
     WHERE u.tenant_id=? GROUP BY u.id ORDER BY total DESC`,
    [tid, tid]
  );

  const wb = new ExcelJS.Workbook();

  const wsM = wb.addWorksheet('Por Mes');
  wsM.columns = [{ header:'Mes', key:'mes', width:12 }, { header:'Oportunidades', key:'oportunidades', width:16 }, { header:'Monto (PEN)', key:'monto', width:16 }];
  wsM.getRow(1).font = { bold:true, color:{argb:'FFFFFFFF'} };
  wsM.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0F766E'} };
  monthly.forEach(r => wsM.addRow(r));

  const wsP = wb.addWorksheet('Pipeline');
  wsP.columns = [{ header:'Etapa', key:'etapa', width:20 }, { header:'Oportunidades', key:'oportunidades', width:16 }, { header:'Monto (PEN)', key:'monto', width:16 }];
  wsP.getRow(1).font = { bold:true, color:{argb:'FFFFFFFF'} };
  wsP.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0F766E'} };
  pipeline.forEach(r => wsP.addRow(r));

  const wsS = wb.addWorksheet('Vendedores');
  wsS.columns = [{ header:'Vendedor', key:'vendedor', width:24 }, { header:'Ganadas', key:'ganadas', width:12 }, { header:'Total (PEN)', key:'total', width:16 }];
  wsS.getRow(1).font = { bold:true, color:{argb:'FFFFFFFF'} };
  wsS.getRow(1).fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF0F766E'} };
  sellers.forEach(r => wsS.addRow(r));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=reporte-crm.xlsx');
  await wb.xlsx.write(res);
  res.end();
};

module.exports = { exportContactsExcel, exportOppsExcel, exportQuotePDF, exportReportExcel, exportReportPDF };
