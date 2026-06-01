/**
 * Limpia planes semanales duplicados/vacíos.
 *
 * Contexto: a lo largo del proyecto se acumularon decenas de planes vacíos por
 * semana (getActivePlanId y /weeks hacen INSERT cuando no encuentran plan, sin
 * constraint de unicidad). Esos planes fantasma no tienen ningún dato y, al
 * caer en el historial, pueden ocultar el plan real con datos.
 *
 * Este script borra SOLO los planes que no tienen NINGÚN dato asociado
 * (viajes, secuencia, simulación, paradas, boxes, lecturas, productividad) y
 * que NO están activos. Nunca toca un plan con datos ni el vigente.
 *
 * Uso:
 *   node scripts/cleanup-empty-plans.js          (dry-run: solo lista)
 *   node scripts/cleanup-empty-plans.js --apply  (borra de verdad)
 *
 * Idempotente y seguro de re-ejecutar.
 */
import 'dotenv/config';
import pool from '../src/db/pool.js';

const APPLY = process.argv.includes('--apply');

// Tablas hijas con columna plan_id que indican que un plan "tiene datos".
const CHILD_TABLES = [
  'trips',
  'sequence_results',
  'silo_simulation',
  'stoppages',
  'box_entries',
  'level_readings',
  'productivity_periods',
];

async function run() {
  const all = await pool.query('SELECT id, week_start, status FROM weekly_plans ORDER BY week_start, id');

  const empties = [];
  for (const p of all.rows) {
    if (p.status === 'active') continue; // nunca tocar el vigente
    let total = 0;
    for (const tbl of CHILD_TABLES) {
      const r = await pool.query(`SELECT count(*)::int n FROM ${tbl} WHERE plan_id = $1`, [p.id]);
      total += r.rows[0].n;
      if (total > 0) break;
    }
    if (total === 0) empties.push(p);
  }

  console.log(`Planes totales: ${all.rows.length}`);
  console.log(`Planes vacíos (sin ningún dato, no activos): ${empties.length}`);
  for (const p of empties) {
    console.log(`  plan ${p.id} | ${String(p.week_start).slice(0, 10)} | ${p.status}`);
  }

  if (empties.length === 0) {
    console.log('Nada que borrar.');
    await pool.end();
    return;
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] No se ha borrado nada. Ejecuta con --apply para borrar.');
    await pool.end();
    return;
  }

  const ids = empties.map((p) => p.id);
  const del = await pool.query('DELETE FROM weekly_plans WHERE id = ANY($1::int[])', [ids]);
  console.log(`\nBorrados ${del.rowCount} planes vacíos.`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
