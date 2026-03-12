import { Router } from 'express';
import pool from '../db/pool.js';
import { EVENT_KEYS } from '../services/webhookEmitter.js';

const router = Router();

// GET /api/webhooks
router.get('/', async (_req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, name, url, events, enabled, created_at FROM webhooks ORDER BY id'
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar webhooks' });
  }
});

// GET /api/webhooks/events - lista de eventos para el front
router.get('/events', (_req, res) => {
  const labels = {
    recalculate_done: 'Recálculo completado',
    delay_detected: 'Retraso detectado',
    trip_extra_added: 'Viaje extra añadido',
    trip_updated: 'Viaje actualizado',
    plan_uploaded: 'Planificación subida',
  };
  res.json(EVENT_KEYS.map((key) => ({ key, label: labels[key] || key })));
});

// POST /api/webhooks
router.post('/', async (req, res) => {
  try {
    const { name, url, events } = req.body || {};
    if (!url || !String(url).trim()) {
      return res.status(400).json({ error: 'URL es obligatoria' });
    }
    const eventsArr = Array.isArray(events)
      ? events.filter((e) => EVENT_KEYS.includes(e))
      : [];
    const r = await pool.query(
      `INSERT INTO webhooks (name, url, events, enabled) VALUES ($1, $2, $3, true) RETURNING id, name, url, events, enabled, created_at`,
      [String(name || '').trim(), String(url).trim(), eventsArr]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear webhook' });
  }
});

// PUT /api/webhooks/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, url, events, enabled } = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (name !== undefined) { updates.push(`name = $${i++}`); values.push(String(name).trim()); }
    if (url !== undefined) { updates.push(`url = $${i++}`); values.push(String(url).trim()); }
    if (events !== undefined) {
      const eventsArr = Array.isArray(events) ? events.filter((e) => EVENT_KEYS.includes(e)) : [];
      updates.push(`events = $${i++}`);
      values.push(eventsArr);
    }
    if (enabled !== undefined) { updates.push(`enabled = $${i++}`); values.push(!!enabled); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(id);
    const r = await pool.query(
      `UPDATE webhooks SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, name, url, events, enabled, created_at`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Webhook no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar webhook' });
  }
});

// DELETE /api/webhooks/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM webhooks WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Webhook no encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar webhook' });
  }
});

export default router;
