/**
 * Crea/regenera un plan de demo para la semana 22 (lunes 2026-05-25) con
 * ~50 viajes inventados, proveedores ficticios y productos genericos.
 * Archiva el plan activo anterior, marca el nuevo como 'active' y recalcula.
 *
 * Uso: node scripts/seed-demo-week22.js
 * Idempotente: borrar y re-ejecutar regenera los mismos datos (seed fijo).
 */
import 'dotenv/config';
import pool from '../src/db/pool.js';
import { recalcPlan } from '../src/services/recalc.js';

const WEEK_START = '2026-05-25';
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const SUPPLIERS = [
  'TRANSPORTS NOVA',
  'LOGISTICA ZETA',
  'GRANS DEL MAR',
  'CEREALES OMEGA',
  'TRANSPORTES IBERPLAN',
  'AGRO DELTA',
  'CAMIONS SIGMA',
  'TRANSPORTES KAPPA',
  'LOGISTICA ATLAS',
  'GRANS BLAU',
];

const PRODUCTOS = ['TRIGO', 'MAIZ', 'CEBADA', 'SOJA', 'COLZA'];

const LETTERS = 'BCDFGHJKLMNPRSTVWXYZ';

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260525);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

function randomMatricula(used) {
  while (true) {
    const num = String(randInt(1000, 9999));
    const letters = Array.from({ length: 3 }, () => LETTERS[Math.floor(rand() * LETTERS.length)]).join('');
    const m = `${num}${letters}`;
    if (!used.has(m)) {
      used.add(m);
      return m;
    }
  }
}

function distributeHours(nTrips) {
  // Genera horas HH:MM repartidas entre 06:00 y 21:30 en pasos de 30 min, sin acumular muchas a la misma hora.
  const slots = [];
  for (let h = 6; h <= 21; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  const out = [];
  for (let i = 0; i < nTrips; i++) {
    out.push(slots[i % slots.length]);
  }
  // mezclar para que no quede ordenado
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function run() {
  console.log('Semilla demo semana 22 -> arrancando...');

  const tolvasRes = await pool.query(
    'SELECT id, numero, nombre FROM tolvas WHERE activa = true ORDER BY numero LIMIT 2'
  );
  if (tolvasRes.rows.length < 2) {
    console.error(`Se necesitan 2 tolvas activas y solo hay ${tolvasRes.rows.length}.`);
    process.exit(1);
  }
  const tolvas = tolvasRes.rows;
  console.log(`Tolvas usadas: ${tolvas.map((t) => `${t.numero}=${t.nombre}`).join(', ')}`);

  // 1) Buscar/crear plan para week_start = WEEK_START
  let planRes = await pool.query('SELECT id, status FROM weekly_plans WHERE week_start = $1', [WEEK_START]);
  let planId;
  if (planRes.rows[0]) {
    planId = planRes.rows[0].id;
    console.log(`Plan existente para ${WEEK_START}: id=${planId} (status=${planRes.rows[0].status}). Se reutilizara.`);
  } else {
    const ins = await pool.query(
      "INSERT INTO weekly_plans (week_start, status) VALUES ($1, 'active') RETURNING id",
      [WEEK_START]
    );
    planId = ins.rows[0].id;
    console.log(`Plan nuevo creado: id=${planId}`);
  }

  // 2) Archivar otros planes activos, marcar el nuestro como active
  await pool.query("UPDATE weekly_plans SET status = 'archived' WHERE status = 'active' AND id <> $1", [planId]);
  await pool.query("UPDATE weekly_plans SET status = 'active' WHERE id = $1", [planId]);
  console.log('Plan marcado como vigente; el resto archivado.');

  // 3) Limpiar datos previos del plan para regenerar
  await pool.query('DELETE FROM sequence_results WHERE plan_id = $1', [planId]);
  await pool.query('DELETE FROM silo_simulation WHERE plan_id = $1', [planId]);
  await pool.query('DELETE FROM trips WHERE plan_id = $1', [planId]);
  await pool.query('DELETE FROM stoppages WHERE plan_id = $1', [planId]);
  await pool.query('DELETE FROM box_entries WHERE plan_id = $1', [planId]);
  await pool.query('DELETE FROM level_readings WHERE plan_id = $1', [planId]);
  await pool.query('DELETE FROM productivity_periods WHERE plan_id = $1', [planId]);
  console.log('Datos previos del plan borrados.');

  // 4) Generar viajes (50 totales, ~8 al dia + un extra suelto)
  const TOTAL_TRIPS = 50;
  const perDay = [9, 9, 8, 8, 8, 8]; // Lun..Sab = 50
  const used = new Set();
  const rows = [];

  let dayIdx = 0;
  let tripsInDay = 0;
  const hoursByDay = perDay.map((n) => distributeHours(n));

  for (let i = 0; i < TOTAL_TRIPS; i++) {
    while (tripsInDay >= perDay[dayIdx]) {
      dayIdx++;
      tripsInDay = 0;
    }
    const day = DAYS[dayIdx];
    const hora = hoursByDay[dayIdx][tripsInDay];
    tripsInDay++;

    const matricula = randomMatricula(used);
    const supplier = pick(SUPPLIERS);
    const producto = pick(PRODUCTOS);
    const tons = (randInt(180, 280) / 10); // 18.0 - 28.0
    const is_critical = rand() < 0.18; // ~18% criticos
    const tolva = pick(tolvas);

    rows.push([planId, matricula, day, hora, supplier, producto, tons, is_critical, false, tolva.id]);
  }

  // Insert por lotes
  const batchSize = 25;
  for (let b = 0; b < rows.length; b += batchSize) {
    const batch = rows.slice(b, b + batchSize);
    const placeholders = batch
      .map((_, i) => {
        const o = i * 10;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10})`;
      })
      .join(', ');
    const flat = batch.flat();
    await pool.query(
      `INSERT INTO trips (plan_id, trip_number, day, scheduled_time, supplier, producto, tons, is_critical, is_extra, tolva_id)
       VALUES ${placeholders}`,
      flat
    );
  }
  console.log(`Insertados ${rows.length} viajes en plan ${planId}.`);

  // 5) Recalcular
  console.log('Recalculando plan...');
  const result = await recalcPlan(planId, { trigger: 'seed_demo' });
  if (!result.ok) {
    console.error('Recalculo fallido:', result);
    process.exit(1);
  }
  console.log(`Recalculo OK: ${result.sequence_count} en secuencia, ${result.simulation_count} pasos de simulacion. Retrasados: ${result.delayed}`);

  await pool.end();
  console.log(`\nLISTO. Plan ${planId} (semana ${WEEK_START}) es el VIGENTE.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
