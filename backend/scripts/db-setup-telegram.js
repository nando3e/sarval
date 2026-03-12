/**
 * Crea las tablas proveedores y telegram_drivers e inserta el seed de proveedores.
 * Usa la misma DATABASE_URL que el backend (backend/.env o desde donde ejecutes).
 *
 * Ejecutar desde la raíz del backend: node scripts/db-setup-telegram.js
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const schemaPath = join(__dirname, '../src/db/schema-telegram-drivers.sql');
const migratePath = join(__dirname, '../src/db/migrate-drop-chofer-proveedor.sql');
const seedPath = join(__dirname, '../src/db/seed-proveedores.sql');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL en el entorno (ej. en backend/.env)');
    process.exit(1);
  }
  try {
    const schema = readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('Tablas proveedores y telegram_drivers creadas (o ya existían).');

    try {
      const migrate = readFileSync(migratePath, 'utf8');
      await pool.query(migrate);
      console.log('Migración chofer–proveedor aplicada (columna quitada si existía).');
    } catch (_) {}

    const { rows } = await pool.query('SELECT COUNT(*) AS n FROM proveedores');
    if (Number(rows[0].n) > 0) {
      console.log('Ya hay proveedores en la tabla, no se ejecuta el seed.');
    } else {
      const seed = readFileSync(seedPath, 'utf8');
      await pool.query(seed);
      console.log('Seed de proveedores insertado.');
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
