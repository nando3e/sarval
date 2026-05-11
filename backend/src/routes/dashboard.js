import { Router } from 'express';
import pool from '../db/pool.js';
import { resolvePlanId, toLocalDateOnly } from '../db/helpers.js';

const router = Router();

const DAY_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function getWeekNumber(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const startOfWeek = new Date(jan4);
  startOfWeek.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const diff = d - startOfWeek;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Devuelve el lunes (YYYY-MM-DD) de la semana que contiene esta fecha. Semana = Lunes a Domingo. */
function getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const utcDay = d.getUTCDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const daysToMonday = utcDay === 0 ? 6 : utcDay - 1; // Domingo -> 6 días atrás, Lunes -> 0, Sábado -> 5
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - daysToMonday);
  return monday.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Formato "Lunes 2 mar" para dejar claro el día de la semana (semana = Lunes a Domingo). */
function formatDateWithDayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dayName = DAY_NAMES_ES[d.getUTCDay()];
  const rest = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${dayName} ${rest}`;
}

// GET /api/dashboard
router.get('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    const tolvaId = req.query.tolva_id ? parseInt(req.query.tolva_id, 10) : null;

    const tolvasRows = await pool.query(
      'SELECT id, numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos FROM tolvas WHERE activa = true ORDER BY numero'
    );
    const tolvas = tolvasRows.rows;

    let horasParadas = 0;
    let stockMinimo = null;
    let totalViajes = 0;
    let viajesConRetraso = 0;
    let weekMeta = null;
    const tolvaStats = [];

    if (planId) {
      const simFilter = tolvaId ? ' AND tolva_id = $2' : '';
      const seqFilter = tolvaId ? ' AND tolva_id = $2' : '';
      const filterParams = tolvaId ? [planId, tolvaId] : [planId];

      const [sim, seq, plan] = await Promise.all([
        pool.query(`SELECT silo_level, is_stoppage, tolva_id FROM silo_simulation WHERE plan_id = $1${simFilter} ORDER BY step_index`, filterParams),
        pool.query(`SELECT delay_capacity_hours, tolva_id FROM sequence_results WHERE plan_id = $1${seqFilter}`, filterParams),
        pool.query('SELECT week_start FROM weekly_plans WHERE id = $1', [planId]),
      ]);

      for (const tolva of tolvas) {
        if (tolvaId && tolva.id !== tolvaId) continue;
        const paso = Number(tolva.paso_minutos) || 30;
        const stepHours = paso / 60;
        const tSim = sim.rows.filter((r) => r.tolva_id === tolva.id);
        const tSeq = seq.rows.filter((r) => r.tolva_id === tolva.id);
        const levels = tSim.map((r) => Number(r.silo_level)).filter((n) => !Number.isNaN(n));
        const hp = tSim.filter((r) => r.is_stoppage === true).length * stepHours;
        const sm = levels.length ? Math.min(...levels) : null;
        const tv = tSeq.length;
        const vr = tSeq.filter((r) => Number(r.delay_capacity_hours) > 0).length;
        horasParadas += hp;
        if (sm !== null && (stockMinimo === null || sm < stockMinimo)) stockMinimo = sm;
        totalViajes += tv;
        viajesConRetraso += vr;
        tolvaStats.push({
          tolva_id: tolva.id,
          tolva_numero: tolva.numero,
          tolva_nombre: tolva.nombre,
          capacidad_tn: Number(tolva.capacidad_tn),
          consumo_tn_h: Number(tolva.consumo_tn_h),
          nivel_inicial_tn: Number(tolva.nivel_inicial_tn),
          horas_paradas: hp,
          stock_minimo: sm,
          total_viajes: tv,
          viajes_con_retraso: vr,
        });
      }

      if (plan.rows[0]) {
        const rawStart = toLocalDateOnly(plan.rows[0].week_start);
        const weekStart = getMondayOfWeek(rawStart);
        const startDate = new Date(weekStart + 'T00:00:00Z');
        const endDate = new Date(startDate);
        endDate.setUTCDate(startDate.getUTCDate() + 6);
        const weekEnd = endDate.toISOString().slice(0, 10);
        const year = startDate.getUTCFullYear();
        weekMeta = {
          week_start: weekStart,
          week_end: weekEnd,
          week_number: getWeekNumber(weekStart),
          week_label: `Semana ${getWeekNumber(weekStart)} · ${formatDateWithDayName(weekStart)} – ${formatDateWithDayName(weekEnd)} ${year}`,
          plan_id: planId,
        };
      }
    }

    res.json({
      tolvas: tolvaStats,
      horas_paradas: horasParadas,
      stock_minimo: stockMinimo,
      total_viajes: totalViajes,
      viajes_con_retraso: viajesConRetraso,
      plan_id: planId,
      week: weekMeta,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
});

// GET /api/dashboard/silo-chart — serie temporal enriquecida para el gráfico de la tolva
router.get('/silo-chart', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.json({ series: [], week: null, tolva: null });

    const tolvaId = req.query.tolva_id ? parseInt(req.query.tolva_id, 10) : null;

    // Si no se especifica tolva, usar la primera activa
    let tolva = null;
    if (tolvaId) {
      const tr = await pool.query('SELECT id, numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos FROM tolvas WHERE id = $1', [tolvaId]);
      tolva = tr.rows[0] || null;
    }
    if (!tolva) {
      const tr = await pool.query('SELECT id, numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos FROM tolvas WHERE activa = true ORDER BY numero LIMIT 1');
      tolva = tr.rows[0] || null;
    }
    if (!tolva) return res.json({ series: [], week: null, tolva: null });

    const [simRows, planRows] = await Promise.all([
      pool.query(
        'SELECT step_index, day, time, entries_tons, box_entry_tons, consumption_tons, silo_level, is_stoppage FROM silo_simulation WHERE plan_id = $1 AND tolva_id = $2 ORDER BY step_index',
        [planId, tolva.id]
      ),
      pool.query('SELECT week_start FROM weekly_plans WHERE id = $1', [planId]),
    ]);

    let weekMeta = null;
    let weekStartDate = null;
    if (planRows.rows[0]) {
      const rawStart = toLocalDateOnly(planRows.rows[0].week_start);
      const weekStart = getMondayOfWeek(rawStart);
      const startDate = new Date(weekStart + 'T00:00:00Z');
      const endDate = new Date(startDate);
      endDate.setUTCDate(startDate.getUTCDate() + 6);
      const weekEnd = endDate.toISOString().slice(0, 10);
      const year = startDate.getUTCFullYear();
      weekStartDate = weekStart;
      weekMeta = {
        week_start: weekStart,
        week_end: weekEnd,
        week_number: getWeekNumber(weekStart),
        week_label: `Semana ${getWeekNumber(weekStart)} · ${formatDateWithDayName(weekStart)} – ${formatDateWithDayName(weekEnd)} ${year}`,
      };
    }

    const series = simRows.rows.map((s) => {
      const dayIdx = DAY_ORDER.indexOf(s.day);

      let timestamp = null;
      if (weekStartDate) {
        const [hh, mm] = String(s.time).split(':').map(Number);
        const base = new Date(weekStartDate + 'T00:00:00Z');
        base.setUTCDate(base.getUTCDate() + Math.max(0, dayIdx));
        base.setUTCHours(hh, mm, 0, 0);
        timestamp = base.getTime();
      }

      return {
        step_index: Number(s.step_index),
        day: s.day,
        time: String(s.time).slice(0, 5),
        label: `${s.day} ${String(s.time).slice(0, 5)}`,
        day_order: dayIdx >= 0 ? dayIdx : 6,
        timestamp,
        entries_tons: Number(s.entries_tons),
        box_entry_tons: Number(s.box_entry_tons) || 0,
        consumption_tons: Number(s.consumption_tons),
        silo_level: Number(s.silo_level),
        is_stoppage: Boolean(s.is_stoppage),
      };
    });

    const tolvaInfo = {
      id: tolva.id,
      numero: tolva.numero,
      nombre: tolva.nombre,
      capacidad_tn: Number(tolva.capacidad_tn),
      consumo_tn_h: Number(tolva.consumo_tn_h),
      nivel_inicial_tn: Number(tolva.nivel_inicial_tn),
    };

    res.json({ series, week: weekMeta, tolva: tolvaInfo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener datos del gráfico' });
  }
});

export default router;
