import pool from '../db/pool.js';
import { DAY_ORDER_SQL } from '../db/helpers.js';
import { run } from '../engine/simulator.js';
import { notifyWebhooks } from './webhookEmitter.js';
import { checkAlerts } from './alertChecker.js';

/**
 * Recalcula un plan completo: corre el motor para todas las tolvas activas y
 * reescribe sequence_results + silo_simulation. Único punto de recálculo de
 * toda la app — lo llaman todas las acciones que alteran la simulación.
 *
 * @param {number} planId
 * @param {Object} opts
 * @param {string} [opts.trigger='manual'] - Acción que disparó el recálculo
 *   (upload, trip_create, trip_update, trip_delete, divert, stoppage, box,
 *   level_reading, productivity, tolva_params, manual). Se conserva para que
 *   más adelante se puedan enganchar webhooks/avisos por tipo de evento.
 * @param {boolean} [opts.notify=false] - Si true, emite webhooks y alertas
 *   (hoy solo lo usa el botón "Actualizar"). Las acciones automáticas
 *   recalculan en silencio; los webhooks por evento se montarán más adelante.
 * @returns {Promise<{ok:boolean, reason?:string, sequence_count?:number, simulation_count?:number, delayed?:Array, newly_delayed?:Array, trigger?:string}>}
 */
export async function recalcPlan(planId, { trigger = 'manual', notify = false } = {}) {
  if (!planId) return { ok: false, reason: 'no_plan' };

  const tolvasRows = await pool.query(
    'SELECT id, numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos, nivel_minimo_alerta_tn, max_espera_critico_h, hora_inicio_consumo, hora_fin_consumo FROM tolvas WHERE activa = true ORDER BY numero'
  );
  if (tolvasRows.rows.length === 0) return { ok: false, reason: 'no_tolvas' };

  // Overrides por semana y tolva (inicio de consumo / nivel inicial). NULL = heredar tolva.
  const overrideRows = await pool.query(
    'SELECT tolva_id, hora_inicio_consumo, nivel_inicial_tn FROM plan_tolva_settings WHERE plan_id = $1',
    [planId]
  );
  const overrideByTolva = new Map(overrideRows.rows.map((r) => [r.tolva_id, r]));

  const allTripsRows = await pool.query(
    `SELECT id, trip_number, day, scheduled_time, supplier, tons, is_critical, is_extra, tolva_id
     FROM trips WHERE plan_id = $1
     ORDER BY ${DAY_ORDER_SQL}, scheduled_time`,
    [planId]
  );

  // Snapshot de retrasos previos: base para el futuro diff de webhooks
  // (avisar solo a quien le cambia el retraso). Hoy se calcula pero no se emite.
  const prevRows = await pool.query('SELECT trip_id, delay_capacity_hours FROM sequence_results WHERE plan_id = $1', [planId]);
  const prevDelay = new Map(prevRows.rows.map((r) => [r.trip_id, Number(r.delay_capacity_hours) || 0]));

  await pool.query('DELETE FROM sequence_results WHERE plan_id = $1', [planId]);
  await pool.query('DELETE FROM silo_simulation WHERE plan_id = $1', [planId]);

  const [allStoppagesRows, allBoxEntriesRows, allReadingsRows, allProductivityRows] = await Promise.all([
    pool.query('SELECT tolva_id, dia, hora_inicio, hora_fin FROM stoppages WHERE plan_id = $1', [planId]),
    pool.query('SELECT tolva_id, total_tons, periodo_horas, dia, hora_inicio FROM box_entries WHERE plan_id = $1', [planId]),
    pool.query('SELECT tolva_id, dia, hora, nivel_tn FROM level_readings WHERE plan_id = $1', [planId]),
    pool.query('SELECT id, tolva_id, dia, hora_inicio, hora_fin, consumo_tn_h FROM productivity_periods WHERE plan_id = $1', [planId]),
  ]);

  let totalSeq = 0;
  let totalSim = 0;
  const allDelayed = [];
  const newlyDelayed = [];
  const sequencesByTolva = {};
  const simulationsByTolva = {};

  for (const tolva of tolvasRows.rows) {
    const tolvaTrips = allTripsRows.rows
      .filter((t) => t.tolva_id === tolva.id)
      .map((t) => ({ ...t, scheduled_time: t.scheduled_time != null ? String(t.scheduled_time).slice(0, 5) : '00:00' }));
    if (tolvaTrips.length === 0) continue;

    const tolvaStoppages = allStoppagesRows.rows.filter((s) => s.tolva_id === tolva.id);
    const tolvaBoxEntries = allBoxEntriesRows.rows.filter((b) => b.tolva_id === tolva.id);
    const tolvaReadings = allReadingsRows.rows.filter((r) => r.tolva_id === tolva.id);
    const tolvaProductivity = allProductivityRows.rows.filter((p) => p.tolva_id === tolva.id);

    // Parámetros efectivos: el override de la semana (si existe y no es NULL)
    // gana al valor por defecto de la tolva.
    const ov = overrideByTolva.get(tolva.id);
    const tolvaParams = {
      ...tolva,
      // La ventana de consumo (inicio/fin) viene de la tolva. La ampliación
      // puntual del finde se hace con franjas, no con override por semana.
      hora_inicio_consumo: tolva.hora_inicio_consumo,
      hora_fin_consumo: tolva.hora_fin_consumo,
      nivel_inicial_tn: ov?.nivel_inicial_tn ?? tolva.nivel_inicial_tn,
    };
    const { sequence, simulation } = run(tolvaParams, tolvaTrips, tolvaStoppages, tolvaBoxEntries, tolvaReadings, tolvaProductivity);

    if (sequence.length > 0) {
      const seqValues = sequence.map((_, i) => {
        const o = i * 7;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7})`;
      }).join(', ');
      const seqParams = sequence.flatMap((r) => [planId, r.trip_id, r.final_day, r.final_time, r.delay_capacity_hours, !!r.retained_for_critical, tolva.id]);
      await pool.query(
        `INSERT INTO sequence_results (plan_id, trip_id, final_day, final_time, delay_capacity_hours, retained_for_critical, tolva_id) VALUES ${seqValues}`,
        seqParams
      );
      totalSeq += sequence.length;
    }

    if (simulation.length > 0) {
      const batchSize = 100;
      for (let b = 0; b < simulation.length; b += batchSize) {
        const batch = simulation.slice(b, b + batchSize);
        const simValues = batch.map((_, i) => {
          const o = i * 10;
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10})`;
        }).join(', ');
        const simParams = batch.flatMap((r) => [planId, r.step_index, r.day, r.time, r.entries_tons, r.box_entry_tons || 0, r.consumption_tons, r.silo_level, r.is_stoppage, tolva.id]);
        await pool.query(
          `INSERT INTO silo_simulation (plan_id, step_index, day, time, entries_tons, box_entry_tons, consumption_tons, silo_level, is_stoppage, tolva_id) VALUES ${simValues}`,
          simParams
        );
      }
      totalSim += simulation.length;
    }

    sequencesByTolva[tolva.id] = sequence;
    simulationsByTolva[tolva.id] = simulation;

    for (const s of sequence) {
      const d = Number(s.delay_capacity_hours) || 0;
      if (d <= 0) continue;
      const tagged = { ...s, tolva_id: tolva.id, tolva_numero: tolva.numero, tolva_nombre: tolva.nombre };
      allDelayed.push(tagged);
      const before = prevDelay.get(s.trip_id) || 0;
      if (before <= 0 || d > before) newlyDelayed.push(tagged); // retraso nuevo o agravado
    }
  }

  // Webhooks/alertas: hoy solo cuando se pide explícitamente (botón Actualizar).
  // Las acciones automáticas recalculan en silencio. Punto único para enganchar
  // los avisos por evento más adelante (usar `trigger` y `newlyDelayed`).
  if (notify) {
    await notifyWebhooks('recalculate_done', { plan_id: planId, trigger, sequence_count: totalSeq, simulation_count: totalSim });
    if (allDelayed.length) {
      await notifyWebhooks('delay_detected', { plan_id: planId, delayed_trips: allDelayed });
    }
    try {
      await checkAlerts(planId, tolvasRows.rows, sequencesByTolva, simulationsByTolva);
    } catch (alertErr) {
      console.error('Error checking alerts:', alertErr);
    }
  }

  return { ok: true, sequence_count: totalSeq, simulation_count: totalSim, delayed: allDelayed, newly_delayed: newlyDelayed, trigger };
}
