const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function seed() {
  const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'ventas_crm'
  });

  const tenant_id = 1;

  console.log('Iniciando poblamiento de base de datos...');

  // 1. Usuarios adicionales
  const hash = await bcrypt.hash('123456', 10);
  await db.query(`INSERT IGNORE INTO users (id, tenant_id, name, email, password, role) VALUES 
    (2, 1, 'Carlos Mendoza', 'carlos@crm.com', ?, 'vendedor'),
    (3, 1, 'Laura Gómez', 'laura@crm.com', ?, 'vendedor')`, [hash, hash]);
  console.log('✅ Usuarios agregados');

  // 2. Contactos (10)
  const contacts = [
    ['Empresa Alpha', 'Juan Pérez', 'juan@alpha.com', '555-0001', 'CEO'],
    ['Tech Solutions', 'María Silva', 'maria@tech.com', '555-0002', 'CTO'],
    ['Global Import', 'Carlos Ruiz', 'carlos@global.com', '555-0003', 'Director'],
    ['Servicios Express', 'Ana Torres', 'ana@express.com', '555-0004', 'Gerente'],
    ['Inversiones Sur', 'Pedro Díaz', 'pedro@sur.com', '555-0005', 'CFO'],
    ['Constructora Base', 'Lucía Vega', 'lucia@base.com', '555-0006', 'Arquitecta'],
    ['Agencia Creativa', 'Diego López', 'diego@creativa.com', '555-0007', 'Diseñador'],
    ['Consultores X', 'Sofía Castro', 'sofia@consultores.com', '555-0008', 'Analista'],
    ['Logística Rápida', 'Andrés Ríos', 'andres@logistica.com', '555-0009', 'Operaciones'],
    ['Farmacias Salud', 'Elena Ortiz', 'elena@salud.com', '555-0010', 'Compras']
  ];
  
  await db.query('DELETE FROM contacts WHERE id > 0'); // Limpiar previos
  for (let c of contacts) {
    await db.query('INSERT INTO contacts (tenant_id, company, name, email, phone, position) VALUES (?,?,?,?,?,?)', [tenant_id, ...c]);
  }
  const [contactRows] = await db.query('SELECT id FROM contacts');
  const cIds = contactRows.map(r => r.id);
  console.log('✅ 10 Contactos agregados');

  // 3. Productos (10)
  const products = [
    ['SKU-001', 'Licencia Software Pro', 'Licencia anual para software', 'Software', 500, 200, 100],
    ['SKU-002', 'Consultoría Básica', 'Paquete de 10 horas', 'Servicios', 1000, 500, 0],
    ['SKU-003', 'Servidor Cloud M', 'Servidor virtual mediano', 'Infraestructura', 150, 100, 50],
    ['SKU-004', 'Servidor Cloud L', 'Servidor virtual grande', 'Infraestructura', 300, 200, 50],
    ['SKU-005', 'Auditoría de Seguridad', 'Revisión completa de sistemas', 'Servicios', 2500, 1000, 0],
    ['SKU-006', 'Soporte Premium 24/7', 'Soporte técnico mensual', 'Servicios', 800, 300, 0],
    ['SKU-007', 'Desarrollo Web E-commerce', 'Desarrollo de tienda online', 'Desarrollo', 4500, 2000, 0],
    ['SKU-008', 'Mantenimiento Mensual', 'Mantenimiento preventivo', 'Servicios', 250, 100, 0],
    ['SKU-009', 'Migración de Datos', 'Migración a la nube', 'Servicios', 1200, 600, 0],
    ['SKU-010', 'Capacitación Personal', 'Curso de 40 horas', 'Educación', 1800, 800, 0]
  ];
  await db.query('DELETE FROM products WHERE id > 0');
  for (let p of products) {
    await db.query('INSERT INTO products (tenant_id, sku, name, description, category, price, cost, stock) VALUES (?,?,?,?,?,?,?,?)', [tenant_id, ...p]);
  }
  console.log('✅ 10 Productos agregados');

  // 4. Oportunidades (10 con diferentes etapas, fechas y usuarios para poblar los gráficos)
  const [stages] = await db.query('SELECT id FROM pipeline_stages WHERE tenant_id=?', [tenant_id]);
  const sIds = stages.map(s => s.id);
  if (sIds.length === 0) throw new Error('No hay pipeline stages');

  const opps = [
    ['Implementación ERP', cIds[0], sIds[0 % sIds.length], 15000, 10, '2026-05-15', 1, 'open'],
    ['Migración a Cloud', cIds[1], sIds[1 % sIds.length], 8500, 30, '2026-05-20', 2, 'open'],
    ['Auditoría Anual', cIds[2], sIds[2 % sIds.length], 4000, 60, '2026-04-30', 3, 'open'],
    ['Renovación Licencias', cIds[3], sIds[3 % sIds.length], 12000, 90, '2026-04-28', 1, 'open'],
    ['Desarrollo App Móvil', cIds[4], sIds[4 % sIds.length], 25000, 100, '2026-04-10', 2, 'won'],
    ['Consultoría Estratégica', cIds[5], sIds[5 % sIds.length], 6000, 0, '2026-04-12', 3, 'lost'],
    ['Mantenimiento Servidores', cIds[6], sIds[0 % sIds.length], 3500, 15, '2026-06-01', 1, 'open'],
    ['Paquete de Seguridad', cIds[7], sIds[1 % sIds.length], 9200, 40, '2026-05-10', 2, 'open'],
    ['Soporte Corporativo', cIds[8], sIds[4 % sIds.length], 18000, 100, '2026-03-25', 1, 'won'],
    ['Capacitación Equipo', cIds[9], sIds[3 % sIds.length], 7500, 80, '2026-05-05', 3, 'open']
  ];
  await db.query('DELETE FROM opportunities WHERE id > 0');
  for (let o of opps) {
    await db.query('INSERT INTO opportunities (tenant_id, title, contact_id, stage_id, amount, probability, close_date, assigned_to, status) VALUES (?,?,?,?,?,?,?,?,?)', [tenant_id, ...o]);
  }
  const [oppRows] = await db.query('SELECT id FROM opportunities');
  const oIds = oppRows.map(r => r.id);
  console.log('✅ 10 Oportunidades agregadas');

  // 5. Actividades (10)
  const acts = [
    ['Llamada de presentación', 'llamada', '2026-04-26 10:00:00', 'pendiente', cIds[0], oIds[0], 1],
    ['Reunión demostración', 'reunion', '2026-04-27 15:30:00', 'pendiente', cIds[1], oIds[1], 2],
    ['Enviar propuesta final', 'tarea', '2026-04-25 18:00:00', 'pendiente', cIds[2], oIds[2], 3],
    ['Seguimiento licencias', 'email', '2026-04-28 09:00:00', 'pendiente', cIds[3], oIds[3], 1],
    ['Cierre de proyecto', 'reunion', '2026-04-10 11:00:00', 'completada', cIds[4], oIds[4], 2],
    ['Analizar motivos pérdida', 'tarea', '2026-04-13 14:00:00', 'completada', cIds[5], oIds[5], 3],
    ['Visita técnica', 'reunion', '2026-05-02 10:00:00', 'pendiente', cIds[6], oIds[6], 1],
    ['Cotizar seguridad', 'tarea', '2026-04-29 16:00:00', 'pendiente', cIds[7], oIds[7], 2],
    ['Onboarding de cliente', 'reunion', '2026-03-26 09:00:00', 'completada', cIds[8], oIds[8], 1],
    ['Negociar descuentos', 'llamada', '2026-04-26 14:30:00', 'pendiente', cIds[9], oIds[9], 3]
  ];
  await db.query('DELETE FROM activities WHERE id > 0');
  for (let a of acts) {
    await db.query('INSERT INTO activities (tenant_id, title, type, scheduled_at, status, contact_id, opportunity_id, assigned_to) VALUES (?,?,?,?,?,?,?,?)', [tenant_id, ...a]);
  }
  console.log('✅ 10 Actividades agregadas');

  // 6. Cotizaciones (10)
  await db.query('DELETE FROM quotes WHERE id > 0');
  for (let i = 0; i < 10; i++) {
    const statuses = ['borrador', 'enviada', 'aprobada', 'rechazada', 'convertida'];
    const st = statuses[i % 5];
    const subtotal = Math.random() * 10000 + 1000;
    const tax = subtotal * 0.16;
    const total = subtotal + tax;
    
    await db.query(`INSERT INTO quotes (tenant_id, number, contact_id, opportunity_id, status, subtotal, discount, tax, total, valid_until) 
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, '2026-05-30')`, 
      [tenant_id, 'COT-2026-' + String(i+1).padStart(3, '0'), cIds[i], oIds[i], st, subtotal, tax, total]);
  }
  console.log('✅ 10 Cotizaciones agregadas');

  console.log('¡Poblamiento completado con éxito!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
