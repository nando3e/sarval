const DAY_INDEX = {
  Lunes: 0, Martes: 1, Miércoles: 2, Jueves: 3, Viernes: 4, Sábado: 5,
};

/** Devuelve la fecha (Date UTC) correspondiente a un día de la semana en un week_start dado. */
export function dateForDay(weekStartIso, dayName) {
  if (!weekStartIso || !dayName) return null;
  const idx = DAY_INDEX[dayName];
  if (idx == null) return null;
  const d = new Date(weekStartIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + idx);
  return d;
}

/** Formato corto "23 nov" usando UTC. */
export function shortDate(weekStartIso, dayName) {
  const d = dateForDay(weekStartIso, dayName);
  if (!d) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Obtiene el week_start del plan actual usando el contexto de semanas. */
export function getWeekStart(planId, weeks) {
  if (!weeks) return null;
  if (planId == null) return weeks.vigente?.week_start || null;
  if (weeks.vigente?.id === planId) return weeks.vigente.week_start;
  if (weeks.proxima?.id === planId) return weeks.proxima.week_start;
  return weeks.pasadas?.find((p) => p.id === planId)?.week_start || null;
}
