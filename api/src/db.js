const { Pool } = require('pg');
const fs = require('node:fs/promises');
const path = require('node:path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  const sql = await fs.readFile(path.join(__dirname, '../migrations/001_initial.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { pool, migrate };
