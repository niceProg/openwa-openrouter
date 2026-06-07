// Koneksi Postgres + migrasi skema idempotent.
const fs = require('node:fs')
const path = require('node:path')
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

pool.on('error', (err) => console.error('[db] pool error:', err.message))

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(sql)
}

const query = (text, params) => pool.query(text, params)

module.exports = { pool, query, migrate }
