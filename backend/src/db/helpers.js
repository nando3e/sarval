import pool from './pool.js';

const DAY_ORDER_SQL = `CASE day
  WHEN 'Lunes' THEN 0 WHEN 'Martes' THEN 1 WHEN 'Miércoles' THEN 2
  WHEN 'Jueves' THEN 3 WHEN 'Viernes' THEN 4 WHEN 'Sábado' THEN 5
  ELSE 6 END`;

export { DAY_ORDER_SQL };

function toLocalDateOnly(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/** Lunes (YYYY-MM-DD) de la semana que contiene esta fecha. Semana = Lunes a Domingo, en UTC. */
function getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const utcDay = d.getUTCDay();
  const daysToMonday = utcDay === 0 ? 6 : utcDay - 1;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - daysToMonday);
  return monday.toISOString().slice(0, 10);
}

/** Lunes (YYYY-MM-DD) de la semana actual según hora local del servidor. */
function getCurrentWeekMonday() {
  const now = new Date();
  const localDay = now.getDay();
  const daysToMonday = localDay === 0 ? 6 : localDay - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Lunes (YYYY-MM-DD) de la semana siguiente. */
function getNextWeekMonday() {
  const current = getCurrentWeekMonday();
  const d = new Date(current + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

export { getMondayOfWeek, getCurrentWeekMonday, getNextWeekMonday };
export { toLocalDateOnly };

export async function getActivePlanId() {
  let r = await pool.query(
    "SELECT id, week_start FROM weekly_plans WHERE status = 'active' ORDER BY week_start DESC LIMIT 1"
  );
  const currentMonday = getCurrentWeekMonday();

  if (r.rows[0]) {
    const planId = r.rows[0].id;
    const rawStart = toLocalDateOnly(r.rows[0].week_start);
    const planMonday = getMondayOfWeek(rawStart);
    if (planMonday < currentMonday) {
      await pool.query("UPDATE weekly_plans SET status = 'archived' WHERE id = $1", [planId]);
      r = await pool.query(
        'INSERT INTO weekly_plans (week_start, status) VALUES ($1, $2) RETURNING id',
        [currentMonday, 'active']
      );
      return r.rows[0].id;
    }
    return planId;
  }

  r = await pool.query(
    'INSERT INTO weekly_plans (week_start, status) VALUES ($1, $2) RETURNING id',
    [currentMonday, 'active']
  );
  return r.rows[0].id;
}

/** Devuelve plan_id: de req.query.plan_id / req.body.plan_id o el plan activo (vigente). */
export async function resolvePlanId(req) {
  const raw = req.query?.plan_id ?? req.body?.plan_id;
  if (raw != null) {
    const id = parseInt(raw, 10);
    if (!Number.isNaN(id)) return id;
  }
  return await getActivePlanId();
}
