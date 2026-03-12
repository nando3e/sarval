import { Router } from 'express';
import pool from '../db/pool.js';
import { getActivePlanId, resolvePlanId, getMondayOfWeek, getNextWeekMonday, DAY_ORDER_SQL, toLocalDateOnly } from '../db/helpers.js';
import { notifyWebhooks } from '../services/webhookEmitter.js';

const router = Router();

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function getWeekNumber(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const startOfWeek = new Date(jan4);
  startOfWeek.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const diff = d - startOfWeek;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function formatDateWithDayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dayName = DAY_NAMES_ES[d.getUTCDay()];
  const rest = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${dayName} ${rest}`;
}

function buildWeekMeta(weekStartStr) {
  const weekStart = getMondayOfWeek(weekStartStr);
  const startDate = new Date(weekStart + 'T00:00:00Z');
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);
  const weekEnd = endDate.toISOString().slice(0, 10);
  const year = startDate.getUTCFullYear();
  return {
    week_start: weekStart,
    week_end: weekEnd,
    week_number: getWeekNumber(weekStart),
    week_label: `Semana ${getWeekNumber(weekStart)} · ${formatDateWithDayName(weekStart)} – ${formatDateWithDayName(weekEnd)} ${year}`,
  };
}

// GET /api/planning/weeks — vigente, próxima (crear si no existe), pasadas (historial)
router.get('/weeks', async (_req, res) => {
  try {
    const nextMonday = getNextWeekMonday();
    const activePlanId = await getActivePlanId();

    const vigenteRow = await pool.query(
      'SELECT id, week_start FROM weekly_plans WHERE id = $1 LIMIT 1',
      [activePlanId]
    );
    let vigente = null;
    if (vigenteRow.rows[0]) {
      const raw = toLocalDateOnly(vigenteRow.rows[0].week_start);
      vigente = { id: vigenteRow.rows[0].id, ...buildWeekMeta(raw), type: 'vigente' };
    }

    let proximaRow = await pool.query(
      'SELECT id, week_start FROM weekly_plans WHERE week_start = $1',
      [nextMonday]
    );
    if (proximaRow.rows.length === 0) {
      const ins = await pool.query(
        "INSERT INTO weekly_plans (week_start, status) VALUES ($1, 'draft') RETURNING id, week_start",
        [nextMonday]
      );
      proximaRow = ins;
    }
    const proxima = proximaRow.rows[0]
      ? { id: proximaRow.rows[0].id, ...buildWeekMeta(toLocalDateOnly(proximaRow.rows[0].week_start)), type: 'proxima' }
      : null;

    const pasadasRows = await pool.query(
      "SELECT id, week_start FROM weekly_plans WHERE status = 'archived' ORDER BY week_start DESC, id DESC"
    );
    const byWeekStart = new Map();
    pasadasRows.rows.forEach((row) => {
      const raw = toLocalDateOnly(row.week_start);
      if (!byWeekStart.has(raw)) byWeekStart.set(raw, row);
    });
    const pasadas = [...byWeekStart.values()]
      .slice(0, 20)
      .map((row) => {
        const raw = toLocalDateOnly(row.week_start);
        return { id: row.id, ...buildWeekMeta(raw), type: 'pasada' };
      });

    res.json({ vigente, proxima, pasadas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener semanas' });
  }
});

router.get('/sequence', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.json([]);
    const r = await pool.query(
      `SELECT sr.id, t.trip_number, t.day, t.scheduled_time AS "hora_prevista",
        t.supplier, t.tons, t.is_critical AS "critico",
        t.delay_h AS "retraso_h", t.new_time AS "nueva_hora", t.status AS "estado",
        t.is_extra AS "viaje_extra", t.scheduled_time AS "hora_real",
        CONCAT(t.day, ' ', t.scheduled_time) AS "clave_hora_real",
        sr.final_day AS "dia_final", sr.final_time AS "hora_final",
        sr.delay_capacity_hours AS "retraso_capacidad_h"
       FROM sequence_results sr
       JOIN trips t ON t.id = sr.trip_id
       WHERE sr.plan_id = $1
       ORDER BY ${DAY_ORDER_SQL}, t.scheduled_time`,
      [planId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener secuenciación' });
  }
});

router.get('/simulation', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.json([]);
    const r = await pool.query(
      'SELECT step_index, day, time, entries_tons, consumption_tons, silo_level, is_stoppage FROM silo_simulation WHERE plan_id = $1 ORDER BY step_index',
      [planId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener simulación' });
  }
});

router.post('/recalculate', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) {
      return res.status(400).json({ error: 'No hay plan activo.' });
    }

    const [paramsRows, tripsRows] = await Promise.all([
      pool.query('SELECT key, value FROM parameters'),
      pool.query(
        `SELECT id, trip_number, day, scheduled_time, supplier, tons, is_critical, is_extra
         FROM trips WHERE plan_id = $1
         ORDER BY ${DAY_ORDER_SQL}, scheduled_time`,
        [planId]
      ),
    ]);
    const parameters = Object.fromEntries(paramsRows.rows.map((r) => [r.key, Number(r.value)]));
    const trips = tripsRows.rows.map((t) => ({
      ...t,
      scheduled_time: t.scheduled_time != null ? String(t.scheduled_time).slice(0, 5) : '00:00',
    }));

    if (trips.length === 0) {
      return res.status(400).json({ error: 'No hay viajes en el plan activo. Sube una planificación o añade viajes.' });
    }

    const { run } = await import('../engine/simulator.js');
    const { sequence, simulation } = run(parameters, trips);

    await pool.query('DELETE FROM sequence_results WHERE plan_id = $1', [planId]);
    await pool.query('DELETE FROM silo_simulation WHERE plan_id = $1', [planId]);

    if (sequence.length > 0) {
      const seqValues = sequence.map((_, i) => {
        const o = i * 5;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5})`;
      }).join(', ');
      const seqParams = sequence.flatMap((r) => [planId, r.trip_id, r.final_day, r.final_time, r.delay_capacity_hours]);
      await pool.query(
        `INSERT INTO sequence_results (plan_id, trip_id, final_day, final_time, delay_capacity_hours) VALUES ${seqValues}`,
        seqParams
      );
    }

    if (simulation.length > 0) {
      const batchSize = 100;
      for (let b = 0; b < simulation.length; b += batchSize) {
        const batch = simulation.slice(b, b + batchSize);
        const simValues = batch.map((_, i) => {
          const o = i * 8;
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
        }).join(', ');
        const simParams = batch.flatMap((r) => [planId, r.step_index, r.day, r.time, r.entries_tons, r.consumption_tons, r.silo_level, r.is_stoppage]);
        await pool.query(
          `INSERT INTO silo_simulation (plan_id, step_index, day, time, entries_tons, consumption_tons, silo_level, is_stoppage) VALUES ${simValues}`,
          simParams
        );
      }
    }

    const delayedTrips = sequence.filter((s) => Number(s.delay_capacity_hours) > 0);
    await notifyWebhooks('recalculate_done', { plan_id: planId, sequence_count: sequence.length, simulation_count: simulation.length });
    if (delayedTrips.length) {
      await notifyWebhooks('delay_detected', { plan_id: planId, delayed_trips: delayedTrips });
    }

    res.json({ message: 'Recálculo completado', plan_id: planId, sequence_count: sequence.length, simulation_count: simulation.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al recalcular' });
  }
});

export default router;
