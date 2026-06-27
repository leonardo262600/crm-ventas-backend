const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'ventas_crm'
};

const getRandomDate = (month) => {
  // month: 1=Ene, 2=Feb, 3=Mar, 4=Abr
  const days = [31, 28, 31, 30];
  const day = Math.floor(Math.random() * days[month-1]) + 1;
  return '2026-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0') + ' 10:00:00';
};

const months = [1, 2, 3, 4]; // Ene, Feb, Mar, Abr

async function seed() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    console.log('Iniciando poblamiento de datos por meses...');
    const tenantId = 1;
    const adminId = 1;

    // Obtener stages
    const [stages] = await connection.query('SELECT id, name FROM pipeline_stages WHERE tenant_id=?', [tenantId]);
    if(stages.length === 0) throw new Error("No hay stages");
    
    // Obtener productos
    const [products] = await connection.query('SELECT id, price FROM products WHERE tenant_id=?', [tenantId]);

    // Crear 10 contactos
    console.log('Creando contactos...');
    let contactIds = [];
    for (let i = 0; i < 10; i++) {
      const month = months[i % 4];
      const date = getRandomDate(month);
      const [r] = await connection.query(
        "INSERT INTO contacts (tenant_id, name, email, phone, company, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [tenantId, "Cliente Mensual " + (i+1), "cliente" + i + "@empresa.com", "99988877" + i, "Empresa " + (i+1), date]
      );
      contactIds.push(r.insertId);
    }

    // Crear 10 oportunidades
    console.log('Creando oportunidades...');
    let oppIds = [];
    for (let i = 0; i < 10; i++) {
      const month = months[i % 4];
      const date = getRandomDate(month);
      const stage = stages[Math.floor(Math.random() * stages.length)];
      // Simular que algunas de enero/febrero ya están ganadas o perdidas
      let status = 'open';
      if (month <= 2 && Math.random() > 0.5) status = 'won';
      else if (month === 3 && Math.random() > 0.8) status = 'lost';

      const [r] = await connection.query(
        "INSERT INTO opportunities (tenant_id, contact_id, assigned_to, title, amount, stage_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [tenantId, contactIds[i], adminId, "Proyecto " + (i+1), (i+1)*1500, stage.id, status, date]
      );
      oppIds.push(r.insertId);
    }

    // Crear 10 actividades
    console.log('Creando actividades...');
    for (let i = 0; i < 10; i++) {
      const month = months[i % 4];
      const date = getRandomDate(month);
      const types = ['llamada', 'reunion', 'email', 'tarea'];
      const type = types[i % 4];
      await connection.query(
        "INSERT INTO activities (tenant_id, opportunity_id, contact_id, assigned_to, type, title, status, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [tenantId, oppIds[i], contactIds[i], adminId, type, "Actividad " + (i+1), 'pendiente', date, date]
      );
    }

    // Crear 10 cotizaciones
    console.log('Creando cotizaciones y facturas...');
    for (let i = 0; i < 10; i++) {
      const month = months[i % 4];
      const date = getRandomDate(month);
      const total = (i+1) * 1500;
      
      const [r] = await connection.query(
        "INSERT INTO quotes (tenant_id, contact_id, opportunity_id, number, subtotal, tax, total, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [tenantId, contactIds[i], oppIds[i], "COT-" + (200+i), total/1.18, total-(total/1.18), total, 'aprobada', date]
      );
      const quoteId = r.insertId;

      // Crear factura de la cotizacion
      await connection.query(
        "INSERT INTO invoices (tenant_id, quote_id, contact_id, number, subtotal, tax, total, status, issue_date, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [tenantId, quoteId, contactIds[i], "FAC-" + (200+i), total/1.18, total-(total/1.18), total, 'emitida', date.split(' ')[0], date.split(' ')[0], adminId, date]
      );
    }

    console.log('Poblamiento mensual exitoso!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await connection.end();
  }
}

seed();
