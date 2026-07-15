import { createHash } from 'node:crypto';
import pool from '../db/pool.js';
import { getCurrentWeekMonday, getNextWeekMonday, toLocalDateOnly } from '../db/helpers.js';
import { recalcPlan } from './recalc.js';

/**
 * Modo simulación: ciclo de vida de los planes clon (status = 'simulation').
 *
 * Un clon copia TODOS los datos de entrada de su plan padre y vive aislado:
 * el frontend rutea a él por plan_id y el resto de la app no se entera. Al
 * "aplicar", sus datos sobrescriben al padre (mismo id de plan real, n8n no
 * se rompe); al "cancelar", se borra sin dejar rastro.
 *
 * LISTA ÚNICA de tablas hijas de un plan. Si se añade una tabla nueva con
 * plan_id, basta con incluirla aquí: el clonado/aplicado copia sus columnas
 * por introspección (information_schema), sin listas de columnas hardcodeadas.
 */
export const DATA_TABLES = [
  'trips',
  'stoppages',
  'box_entries',
  'level_readings',
  'productivity_periods',
  'plan_tolva_settings',
];

// Resultados del motor: no se clonan ni se copian al aplicar — los regenera recalcPlan.
export const RESULT_TABLES = ['sequence_results', 'silo_simulation'];

const TABLE_LABELS = {
  trips: 'Viajes',
  stoppages: 'Paradas',
  box_entries: 'Boxes',
  level_readings: 'Lecturas de nivel',
  productivity_periods: 'Franjas de productividad',
  plan_tolva_settings: 'Ajustes de tolva por semana',
};

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Cache de columnas por tabla (excluyendo id y plan_id). El esquema solo
// cambia con un despliegue, así que cachear de por vida del proceso es seguro.
const columnsCache = new Map();

async function getDataColumns(client, table) {
  if (columnsCache.has(table)) return columnsCache.get(table);
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name NOT IN ('id', 'plan_id')
     ORDER BY ordinal_position`,
    [table]
  );
  if (r.rows.length === 0) throw new Error(`Tabla desconocida en modo simulación: ${table}`);
  const cols = r.rows.map((row) => row.column_name);
  columnsCache.set(table, cols);
  return cols;
}

/** Copia las filas de `table` de un plan a otro (todas las columnas menos id/plan_id). */
async function copyTable(client, table, fromPlanId, toPlanId) {
  const cols = await getDataColumns(client, table);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  await client.query(
    `INSERT INTO "${table}" (plan_id, ${colList})
     SELECT $2, ${colList} FROM "${table}" WHERE plan_id = $1`,
    [fromPlanId, toPlanId]
  );
}

// Resultados primero: sequence_results referencia a trips (FK trip_id), así
// que hay que borrarlos antes que los datos (mismo orden que migrate-unique-week.sql).
async function deleteChildren(client, planId, tables = [...RESULT_TABLES, ...DATA_TABLES]) {
  for (const table of tables) {
    await client.query(`DELETE FROM "${table}" WHERE plan_id = $1`, [planId]);
  }
}

/** Filas de datos de una tabla, serializadas de forma estable (para fingerprint y diff). */
async function serializedRows(client, table, planId) {
  const cols = await getDataColumns(client, table);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const r = await client.query(
    `SELECT ${colList} FROM "${table}" WHERE plan_id = $1 ORDER BY ${colList}`,
    [planId]
  );
  return r.rows.map((row) => JSON.stringify(cols.map((c) => row[c])));
}

/**
 * Hash estable del contenido de datos de un plan. Se guarda en el clon al
 * crearlo (base_fingerprint) para poder avisar de "el plan base cambió" si el
 * padre recibe cambios reales (n8n, otro usuario) mientras se simula.
 */
export async function computeFingerprint(planId, client = pool) {
  const hash = createHash('sha256');
  for (const table of DATA_TABLES) {
    hash.update(table);
    for (const row of await serializedRows(client, table, planId)) hash.update(row);
  }
  return hash.digest('hex');
}

/** Plan clon por id, o 404. Lanza también si el id no es un plan de simulación. */
export async function loadSimulation(cloneId) {
  const r = await pool.query(
    'SELECT id, week_start, status, parent_plan_id, simulation_owner, base_fingerprint FROM weekly_plans WHERE id = $1',
    [cloneId]
  );
  const row = r.rows[0];
  if (!row || row.status !== 'simulation') throw httpError(404, 'Simulación no encontrada');
  return row;
}

/** Simulación abierta de un usuario (o null). Como máximo hay una por usuario. */
export async function findOpenSimulation(owner) {
  const r = await pool.query(
    `SELECT c.id, c.parent_plan_id, c.created_at, p.week_start
     FROM weekly_plans c JOIN weekly_plans p ON p.id = c.parent_plan_id
     WHERE c.status = 'simulation' AND c.simulation_owner = $1
     ORDER BY c.id DESC LIMIT 1`,
    [owner]
  );
  return r.rows[0] || null;
}

/**
 * Entra en modo simulación: clona el plan (cabecera + tablas de datos, nunca
 * resultados) y recalcula el clon en silencio. Solo se simula la semana
 * vigente o la próxima (decisión §14 de DOCS/PROPUESTA_SIMULACION.md).
 */
export async function clonePlan(parentPlanId, owner) {
  const existing = await findOpenSimulation(owner);
  if (existing) {
    const err = httpError(409, 'Ya tienes una simulación abierta');
    err.simulation = existing;
    throw err;
  }

  const r = await pool.query('SELECT id, week_start, status FROM weekly_plans WHERE id = $1', [parentPlanId]);
  const parent = r.rows[0];
  if (!parent) throw httpError(404, 'Plan no encontrado');
  if (parent.status === 'simulation') throw httpError(400, 'No se puede simular sobre otra simulación');
  const weekStart = toLocalDateOnly(parent.week_start);
  const esVigenteOProxima = weekStart === getCurrentWeekMonday() || weekStart === getNextWeekMonday();
  if (!esVigenteOProxima || !['active', 'draft'].includes(parent.status)) {
    throw httpError(400, 'Solo se puede simular sobre la semana vigente o la próxima');
  }

  const client = await pool.connect();
  let cloneId;
  try {
    await client.query('BEGIN');
    const fingerprint = await computeFingerprint(parentPlanId, client);
    const ins = await client.query(
      `INSERT INTO weekly_plans (week_start, status, parent_plan_id, simulation_owner, base_fingerprint)
       VALUES ($1, 'simulation', $2, $3, $4) RETURNING id`,
      [weekStart, parentPlanId, owner, fingerprint]
    );
    cloneId = ins.rows[0].id;
    for (const table of DATA_TABLES) await copyTable(client, table, parentPlanId, cloneId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await recalcPlan(cloneId, { trigger: 'simulation_start', notify: false });
  return { simulation_plan_id: cloneId, parent_plan_id: parentPlanId };
}

/** KPIs de un plan con las mismas definiciones que el Dashboard. */
async function kpisForPlan(planId, pasoByTolva) {
  const [delayed, stops, minLevel] = await Promise.all([
    pool.query('SELECT count(*)::int n FROM sequence_results WHERE plan_id = $1 AND delay_capacity_hours > 0', [planId]),
    pool.query('SELECT tolva_id, count(*)::int n FROM silo_simulation WHERE plan_id = $1 AND is_stoppage = true GROUP BY tolva_id', [planId]),
    pool.query('SELECT min(silo_level) m FROM silo_simulation WHERE plan_id = $1', [planId]),
  ]);
  let horasParadas = 0;
  for (const row of stops.rows) {
    horasParadas += row.n * ((pasoByTolva.get(row.tolva_id) || 30) / 60);
  }
  return {
    viajes_con_retraso: delayed.rows[0].n,
    horas_paradas: Math.round(horasParadas * 100) / 100,
    stock_minimo: minLevel.rows[0].m != null ? Number(minLevel.rows[0].m) : null,
  };
}

/**
 * Resumen de cambios del clon respecto a su padre: altas/bajas/modificados por
 * tabla (comparando filas sin id/plan_id; un par alta+baja se muestra como
 * "modificado"), KPIs comparados y aviso de si el padre cambió desde el clonado.
 */
export async function getSimulationDiff(cloneId) {
  const clone = await loadSimulation(cloneId);
  const parentId = clone.parent_plan_id;

  const tables = [];
  for (const table of DATA_TABLES) {
    const [parentRows, cloneRows] = await Promise.all([
      serializedRows(pool, table, parentId),
      serializedRows(pool, table, cloneId),
    ]);
    // Comparación de multiconjuntos: cuenta apariciones de cada fila serializada.
    const counts = new Map();
    for (const row of parentRows) counts.set(row, (counts.get(row) || 0) + 1);
    for (const row of cloneRows) counts.set(row, (counts.get(row) || 0) - 1);
    let soloReal = 0;
    let soloClon = 0;
    for (const n of counts.values()) {
      if (n > 0) soloReal += n;
      else if (n < 0) soloClon += -n;
    }
    const modificados = Math.min(soloReal, soloClon);
    tables.push({
      tabla: table,
      etiqueta: TABLE_LABELS[table] || table,
      altas: soloClon - modificados,
      bajas: soloReal - modificados,
      modificados,
    });
  }

  const tolvas = await pool.query('SELECT id, paso_minutos FROM tolvas');
  const pasoByTolva = new Map(tolvas.rows.map((t) => [t.id, Number(t.paso_minutos) || 30]));
  const [kpisReal, kpisSim, parentFingerprint] = await Promise.all([
    kpisForPlan(parentId, pasoByTolva),
    kpisForPlan(cloneId, pasoByTolva),
    computeFingerprint(parentId),
  ]);

  return {
    simulation_plan_id: cloneId,
    parent_plan_id: parentId,
    tables,
    hay_cambios: tables.some((t) => t.altas || t.bajas || t.modificados),
    kpis: { real: kpisReal, simulacion: kpisSim },
    base_changed: parentFingerprint !== clone.base_fingerprint,
  };
}

/**
 * Aplica la simulación: en UNA transacción sobrescribe los datos del padre con
 * los del clon y borra el clon. El id del plan real no cambia (las referencias
 * externas — n8n, enlaces — siguen valiendo). Después recalcula el padre CON
 * notificaciones: es el único momento en que los cambios se vuelven reales.
 */
export async function applySimulation(cloneId) {
  const clone = await loadSimulation(cloneId);
  const parentId = clone.parent_plan_id;
  const diff = await getSimulationDiff(cloneId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await deleteChildren(client, parentId);
    for (const table of DATA_TABLES) await copyTable(client, table, cloneId, parentId);
    await deleteChildren(client, cloneId);
    await client.query('DELETE FROM weekly_plans WHERE id = $1', [cloneId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Fuera de la transacción: si fallara, los datos ya son correctos y un
  // "Actualizar" manual regenera los resultados.
  const recalc = await recalcPlan(parentId, { trigger: 'simulation_apply', notify: true });
  return { parent_plan_id: parentId, diff, recalc };
}

/** Cancela la simulación: borra el clon y todos sus hijos. El padre no se toca. */
export async function discardSimulation(cloneId) {
  const clone = await loadSimulation(cloneId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await deleteChildren(client, clone.id);
    await client.query('DELETE FROM weekly_plans WHERE id = $1', [clone.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { deleted: clone.id };
}

/**
 * Janitor: borra simulaciones huérfanas (navegador cerrado y no retomadas).
 * Se ejecuta al arrancar y periódicamente desde server.js.
 */
export async function cleanupStaleSimulations(maxAgeHours = 24) {
  try {
    const r = await pool.query(
      `SELECT id FROM weekly_plans
       WHERE status = 'simulation' AND created_at < NOW() - make_interval(hours => $1)`,
      [maxAgeHours]
    );
    for (const row of r.rows) {
      await discardSimulation(row.id).catch((err) =>
        console.error(`[simulation] error borrando clon huérfano ${row.id}:`, err.message)
      );
    }
    if (r.rows.length) console.log(`[simulation] ${r.rows.length} simulación(es) huérfana(s) borrada(s).`);
  } catch (err) {
    console.error('[simulation] janitor falló:', err.message);
  }
}
