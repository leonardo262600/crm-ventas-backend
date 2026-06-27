const mysql = require('mysql2/promise');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? {
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+00:00',
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ventas_crm',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+00:00',
    };

const pool = mysql.createPool(poolConfig);

module.exports = pool;
