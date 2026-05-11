import { Router } from 'express';
import pool from '../db/pool.js';
import { getActivePlanId, resolvePlanId, getMondayOfWeek, getNextWeekMonday, DAY_ORDER_SQL, toLocalDateOnly } from '../db/helpers.js';
import { notifyWebhooks } from '../services/webhookEmitter.js';
import { checkAlerts } from '../services/alertChecker.js';

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
    const tolvaId = req.query.tolva_id ? parseInt(req.query.tolva_id, 10) : null;
    const whereTolva = tolvaId ? ' AND sr.tolva_id = $2' : '';
    const params = tolvaId ? [planId, tolvaId] : [planId];
    const r = await pool.query(
      `SELECT sr.id, t.trip_number, t.day, t.scheduled_time AS "hora_prevista",
        t.supplier, t.tons, t.is_critical AS "critico",
        t.delay_h AS "retraso_h", t.new_time AS "nueva_hora", t.status AS "estado",
        t.is_extra AS "viaje_extra", t.scheduled_time AS "hora_real",
        CONCAT(t.day, ' ', t.scheduled_time) AS "clave_hora_real",
        sr.final_day AS "dia_final", sr.final_time AS "hora_final",
        sr.delay_capacity_hours AS "retraso_capacidad_h",
        sr.retained_for_critical AS "retenido_por_critico",
        sr.tolva_id, tol.numero AS "tolva_numero", tol.nombre AS "tolva_nombre"
       FROM sequence_results sr
       JOIN trips t ON t.id = sr.trip_id
       LEFT JOIN tolvas tol ON tol.id = sr.tolva_id
       WHERE sr.plan_id = $1${whereTolva}
       ORDER BY sr.tolva_id, ${DAY_ORDER_SQL}, t.scheduled_time`,
      params
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
    const tolvaId = req.query.tolva_id ? parseInt(req.query.tolva_id, 10) : null;
    const whereTolva = tolvaId ? ' AND tolva_id = $2' : '';
    const params = tolvaId ? [planId, tolvaId] : [planId];
    const r = await pool.query(
      `SELECT step_index, day, time, entries_tons, box_entry_tons, consumption_tons, silo_level, is_stoppage, tolva_id
       FROM silo_simulation WHERE plan_id = $1${whereTolva}
       ORDER BY tolva_id, step_index`,
      params
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

    const tolvasRows = await pool.query(
      'SELECT id, numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos, nivel_minimo_alerta_tn, max_espera_critico_h FROM tolvas WHERE activa = true ORDER BY numero'
    );
    if (tolvasRows.rows.length === 0) {
      return res.status(400).json({ error: 'No hay tolvas activas configuradas.' });
    }

    const allTripsRows = await pool.query(
      `SELECT id, trip_number, day, scheduled_time, supplier, tons, is_critical, is_extra, tolva_id
       FROM trips WHERE plan_id = $1
       ORDER BY ${DAY_ORDER_SQL}, scheduled_time`,
      [planId]
    );
    if (allTripsRows.rows.length === 0) {
      return res.status(400).json({ error: 'No hay viajes en el plan activo. Sube una planificación o añade viajes.' });
    }

    const { run } = await import('../engine/simulator.js');

    await pool.query('DELETE FROM sequence_results WHERE plan_id = $1', [planId]);
    await pool.query('DELETE FROM silo_simulation WHERE plan_id = $1', [planId]);

    let totalSeq = 0;
    let totalSim = 0;
    const allDelayed = [];
    const sequencesByTolva = {};
    const simulationsByTolva = {};

    const allStoppagesRows = await pool.query(
      'SELECT tolva_id, dia, hora_inicio, hora_fin FROM stoppages WHERE plan_id = $1',
      [planId]
    );
    const allBoxEntriesRows = await pool.query(
      'SELECT tolva_id, total_tons, periodo_horas, dia, hora_inicio FROM box_entries WHERE plan_id = $1',
      [planId]
    );

    for (const tolva of tolvasRows.rows) {
      const tolvaTrips = allTripsRows.rows
        .filter((t) => t.tolva_id === tolva.id)
        .map((t) => ({
          ...t,
          scheduled_time: t.scheduled_time != null ? String(t.scheduled_time).slice(0, 5) : '00:00',
        }));

      if (tolvaTrips.length === 0) continue;

      const tolvaStoppages = allStoppagesRows.rows.filter((s) => s.tolva_id === tolva.id);
      const tolvaBoxEntries = allBoxEntriesRows.rows.filter((b) => b.tolva_id === tolva.id);
      const { sequence, simulation } = run(tolva, tolvaTrips, tolvaStoppages, tolvaBoxEntries);

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

      const delayed = sequence
        .filter((s) => Number(s.delay_capacity_hours) > 0)
        .map((s) => ({ ...s, tolva_id: tolva.id, tolva_numero: tolva.numero, tolva_nombre: tolva.nombre }));
      allDelayed.push(...delayed);
    }

    await notifyWebhooks('recalculate_done', { plan_id: planId, sequence_count: totalSeq, simulation_count: totalSim });
    if (allDelayed.length) {
      await notifyWebhooks('delay_detected', { plan_id: planId, delayed_trips: allDelayed });
    }

    // Alertas preventivas (FASE F)
    try {
      await checkAlerts(planId, tolvasRows.rows, sequencesByTolva, simulationsByTolva);
    } catch (alertErr) {
      console.error('Error checking alerts:', alertErr);
    }

    res.json({ message: 'Recálculo completado', plan_id: planId, sequence_count: totalSeq, simulation_count: totalSim });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al recalcular' });
  }
});

export default router;
