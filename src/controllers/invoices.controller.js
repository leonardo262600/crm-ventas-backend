const db = require('../config/db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const list = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT i.*, c.name as contact_name, c.company 
       FROM invoices i 
       LEFT JOIN contacts c ON i.contact_id = c.id 
       WHERE i.tenant_id = ? ORDER BY i.created_at DESC`,
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const [invs] = await db.query(
      `SELECT i.*, c.name as contact_name, c.email as contact_email, c.address as contact_address 
       FROM invoices i LEFT JOIN contacts c ON i.contact_id = c.id 
       WHERE i.id=? AND i.tenant_id=?`,
      [req.params.id, req.user.tenant_id]
    );
    if (!invs.length) return res.status(404).json({ message: 'No encontrado' });

    const [items] = await db.query('SELECT * FROM invoice_items WHERE invoice_id=?', [req.params.id]);
    res.json({ ...invs[0], items });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const createFromQuote = async (req, res) => {
  const { quote_id } = req.body;
  try {
    // 1. Obtener datos de la cotización
    const [quotes] = await db.query('SELECT * FROM quotes WHERE id=? AND tenant_id=?', [quote_id, req.user.tenant_id]);
    if (!quotes.length) return res.status(404).json({ message: 'Cotización no encontrada' });
    const quote = quotes[0];

    // 2. Generar número de factura
    const [countRow] = await db.query('SELECT COUNT(*) as c FROM invoices WHERE tenant_id=?', [req.user.tenant_id]);
    const num = `FAC-${new Date().getFullYear()}-${String(countRow[0].c + 1).padStart(4, '0')}`;

    // 3. Crear factura
    const [r] = await db.query(
      `INSERT INTO invoices (tenant_id, quote_id, contact_id, number, subtotal, tax, total, status, issue_date, due_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'emitida', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), ?)`,
      [req.user.tenant_id, quote.id, quote.contact_id, num, quote.subtotal, quote.tax, quote.total, req.user.id]
    );
    const invoiceId = r.insertId;

    // 4. Copiar ítems
    const [qItems] = await db.query('SELECT * FROM quote_items WHERE quote_id=?', [quote_id]);
    for (let item of qItems) {
      await db.query(
        'INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, total) VALUES (?,?,?,?,?,?)',
        [invoiceId, item.product_id, item.description, item.quantity, item.unit_price, item.total]
      );
    }

    res.status(201).json({ id: invoiceId, number: num, message: 'Factura generada' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateStatus = async (req, res) => {
  const { status } = req.body;
  try {
    await db.query('UPDATE invoices SET status=? WHERE id=? AND tenant_id=?', [status, req.params.id, req.user.tenant_id]);
    res.json({ message: 'Estado actualizado' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const downloadPDF = async (req, res) => {
  try {
    const [invs] = await db.query(
      `SELECT i.*, c.name as contact_name, c.company as contact_company, c.address as contact_address 
       FROM invoices i LEFT JOIN contacts c ON i.contact_id = c.id 
       WHERE i.id=? AND i.tenant_id=?`,
      [req.params.id, req.user.tenant_id]
    );
    if (!invs.length) return res.status(404).json({ message: 'No encontrado' });
    const inv = invs[0];

    const [items] = await db.query('SELECT * FROM invoice_items WHERE invoice_id=?', [req.params.id]);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Factura_${inv.number}.pdf`);
    doc.pipe(res);

    // Cabecera
    doc.fontSize(20).text('FACTURA COMERCIAL', { align: 'right' });
    doc.fontSize(10).text(`Factura Nº: ${inv.number}`, { align: 'right' });
    doc.text(`Fecha Emisión: ${inv.issue_date?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]}`, { align: 'right' });
    doc.text(`Vencimiento: ${inv.due_date?.toISOString().split('T')[0] || ''}`, { align: 'right' });
    doc.moveDown(2);

    // Datos Empresa
    doc.fontSize(14).text('CRM Ventas S.A.');
    doc.fontSize(10).text('Av. Principal 123, Ciudad');
    doc.text('RFC: CRM123456789');
    doc.moveDown(2);

    // Datos Cliente
    doc.fontSize(12).text('Facturado a:');
    doc.fontSize(10).text(inv.contact_company || inv.contact_name);
    if (inv.contact_address) doc.text(inv.contact_address);
    doc.moveDown(2);

    // Tabla de Ítems
    const tableTop = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('Descripción', 50, tableTop);
    doc.text('Cant', 300, tableTop, { width: 50, align: 'right' });
    doc.text('Precio', 370, tableTop, { width: 70, align: 'right' });
    doc.text('Total', 460, tableTop, { width: 70, align: 'right' });
    doc.moveTo(50, tableTop + 15).lineTo(530, tableTop + 15).stroke();

    let y = tableTop + 25;
    doc.font('Helvetica');
    items.forEach(it => {
      doc.text(it.description || 'Producto', 50, y, { width: 240 });
      doc.text(it.quantity.toString(), 300, y, { width: 50, align: 'right' });
      doc.text(`$${Number(it.unit_price).toFixed(2)}`, 370, y, { width: 70, align: 'right' });
      doc.text(`$${Number(it.total).toFixed(2)}`, 460, y, { width: 70, align: 'right' });
      y += 20;
    });

    doc.moveTo(50, y).lineTo(530, y).stroke();
    y += 15;

    // Totales
    doc.font('Helvetica-Bold');
    doc.text('Subtotal:', 370, y, { width: 70, align: 'right' });
    doc.text(`$${Number(inv.subtotal).toFixed(2)}`, 460, y, { width: 70, align: 'right' });
    y += 20;
    doc.text('Impuestos:', 370, y, { width: 70, align: 'right' });
    doc.text(`$${Number(inv.tax).toFixed(2)}`, 460, y, { width: 70, align: 'right' });
    y += 20;
    doc.fontSize(14).text('Total a Pagar:', 350, y, { width: 90, align: 'right' });
    doc.text(`$${Number(inv.total).toFixed(2)}`, 460, y, { width: 70, align: 'right' });

    // Footer
    doc.fontSize(10).font('Helvetica');
    doc.text('Gracias por su preferencia.', 50, doc.page.height - 100, { align: 'center' });

    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: err.message });
  }
};

module.exports = { list, getOne, createFromQuote, updateStatus, downloadPDF };
