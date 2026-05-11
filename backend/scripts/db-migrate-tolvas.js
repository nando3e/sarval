/**
 * Aplica la migración de sistema multi-tolva.
 * Crea la tabla tolvas, migra parámetros, añade tolva_id a trips/sequence/simulation.
 *
 * Ejecutar desde la raíz del backend: node scripts/db-migrate-tolvas.js
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sqlPath = join(__dirname, '../src/db/migrate-tolvas.sql');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL en el entorno (ej. en backend/.env)');
    process.exit(1);
  }
  try {
    const sql = readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Migración multi-tolva aplicada correctamente.');

    const { rows } = await pool.query('SELECT id, numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos FROM tolvas ORDER BY numero');
    console.log('Tolvas en la base de datos:');
    for (const t of rows) {
      console.log(`  #${t.numero} "${t.nombre}" — cap: ${t.capacidad_tn}tn, consumo: ${t.consumo_tn_h}tn/h, nivel: ${t.nivel_inicial_tn}tn, paso: ${t.paso_minutos}min`);
    }
  } catch (err) {
    console.error('Error al aplicar migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
