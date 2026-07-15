import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Runner de migraciones. Aplica al arrancar las migraciones que aún no constan
 * en la tabla `_migrations`, en orden, y las registra. Cada `.sql` es idempotente,
 * así que si una BBDD ya tenía cambios aplicados a mano, la primera pasada los
 * re-aplica sin efecto y queda registrada; las siguientes arrancadas las saltan.
 *
 * NOTA: los `seed-*.sql` NO se incluyen (son datos de ejemplo, no esquema). Las
 * tablas base (weekly_plans, trips, sequence_results, silo_simulation, users,
 * parameters) se asumen existentes; estos archivos solo añaden/alteran encima.
 *
 * Para añadir una migración nueva: crear el `.sql` y añadir su nombre AL FINAL
 * de la lista (el orden importa por dependencias entre tablas).
 */
const MIGRATIONS = [
  'schema-telegram-drivers.sql', // proveedores, telegram_drivers
  'migrate-tolvas.sql',          // tabla tolvas + tolva_id en trips/sequence_results/silo_simulation
  'migrate-producto.sql',        // trips.producto
  'migrate-trip-number-string.sql',
  'migrate-critical-anticipation.sql',
  'migrate-stoppages.sql',
  'migrate-box-entries.sql',
  'migrate-level-readings.sql',
  'migrate-productivity-periods.sql',
  'migrate-personal-planta.sql',
  'migrate-app-settings.sql',
  'schema-config.sql',           // app_settings + webhooks
  'migrate-consumo-inicio.sql',  // tolvas.hora_inicio_consumo + plan_tolva_settings
  'migrate-consumo-fin.sql',     // tolvas.hora_fin_consumo
  'migrate-unique-week.sql',     // dedup + UNIQUE(week_start)
  'migrate-drop-chofer-proveedor.sql',
  'migrate-simulation-mode.sql', // índice único parcial + columnas de clon (modo simulación)
];

export async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const done = new Set(
    (await pool.query('SELECT name FROM _migrations')).rows.map((r) => r.name)
  );

  let applied = 0;
  for (const name of MIGRATIONS) {
    if (done.has(name)) continue;
    try {
      const sql = await readFile(join(__dirname, name), 'utf8');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
      applied++;
      console.log(`[migrate] aplicada: ${name}`);
    } catch (err) {
      // No tumbamos el arranque por una migración: log claro y seguimos.
      console.error(`[migrate] ERROR en ${name}: ${err.message}`);
    }
  }

  if (applied === 0) console.log('[migrate] sin migraciones pendientes.');
  else console.log(`[migrate] ${applied} migración(es) aplicada(s).`);
}
