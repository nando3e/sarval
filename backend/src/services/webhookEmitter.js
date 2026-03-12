import pool from '../db/pool.js';

const EVENT_KEYS = [
  'recalculate_done',
  'delay_detected',
  'trip_extra_added',
  'trip_updated',
  'plan_uploaded',
];

export { EVENT_KEYS };

/**
 * Obtiene la zona horaria configurada.
 */
export async function getTimezone() {
  const r = await pool.query("SELECT value FROM app_settings WHERE key = 'timezone'");
  return (r.rows[0]?.value || 'Europe/Madrid').trim();
}

/**
 * Notifica a todos los webhooks que tengan suscrito el evento.
 * @param {string} event - Uno de EVENT_KEYS
 * @param {object} payload - Datos a enviar (se serializa en body)
 */
export async function notifyWebhooks(event, payload = {}) {
  let rows = [];
  try {
    const r = await pool.query(
      "SELECT id, url, name FROM webhooks WHERE enabled = true AND $1 = ANY(events)",
      [event]
    );
    rows = r.rows;
  } catch (e) {
    console.error('webhookEmitter: error listing webhooks', e);
    return;
  }

  const tz = await getTimezone();
  const timestamp = new Date().toLocaleString('sv-SE', { timeZone: tz });

  const body = {
    event,
    data: payload,
    timestamp,
    timezone: tz,
  };

  for (const w of rows) {
    try {
      const res = await fetch(w.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`webhookEmitter: ${w.url} returned ${res.status}`);
      }
    } catch (err) {
      console.warn(`webhookEmitter: failed to POST to ${w.url}`, err.message);
    }
  }
}
