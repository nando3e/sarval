import { Router } from 'express';
import pool from '../db/pool.js';
import { getActivePlanId, resolvePlanId, getMondayOfWeek, getNextWeekMonday, DAY_ORDER_SQL, toLocalDateOnly } from '../db/helpers.js';
import { notifyWebhooks } from '../services/webhookEmitter.js';
import { checkAlerts } from '../services/alertChecker.js';
import { recalcPlan } from '../services/recalc.js';

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
      `SELECT sr.id, t.id AS "trip_id", t.trip_number, t.day, t.scheduled_time AS "hora_prevista",
        t.supplier, t.producto, t.tons, t.is_critical AS "critico",
        t.delay_h AS "retraso_h", t.new_time AS "nueva_hora", t.status AS "estado",
        t.is_extra AS "viaje_extra",
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
    if (!planId) return res.status(400).json({ error: 'No hay plan activo.' });
    // Botón "Actualizar": recálculo manual con notificaciones activadas.
    const result = await recalcPlan(planId, { trigger: 'manual', notify: true });
    if (!result.ok && result.reason === 'no_tolvas') {
      return res.status(400).json({ error: 'No hay tolvas activas configuradas.' });
    }
    res.json({ message: 'Recálculo completado', plan_id: planId, sequence_count: result.sequence_count || 0, simulation_count: result.simulation_count || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al recalcular' });
  }
});

export default router;
