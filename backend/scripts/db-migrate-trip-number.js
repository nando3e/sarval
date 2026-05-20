/**
 * Aplica la migración de trip_number como matrícula alfanumérica única por plan.
 * Ejecutar desde la raíz del backend: node scripts/db-migrate-trip-number.js
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sqlPath = join(__dirname, '../src/db/migrate-trip-number-string.sql');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL en el entorno (ej. en backend/.env)');
    process.exit(1);
  }
  try {
    const sql = readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Migración trip_number (matrícula) aplicada correctamente.');
  } catch (err) {
    console.error('Error al aplicar migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
