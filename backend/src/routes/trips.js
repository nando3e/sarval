import { Router } from 'express';
import pool from '../db/pool.js';
import { resolvePlanId, DAY_ORDER_SQL } from '../db/helpers.js';
import { notifyWebhooks } from '../services/webhookEmitter.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.json([]);
    const day = req.query.day;
    const q = day
      ? `SELECT * FROM trips WHERE plan_id = $1 AND day = $2 ORDER BY scheduled_time`
      : `SELECT * FROM trips WHERE plan_id = $1 ORDER BY ${DAY_ORDER_SQL}, scheduled_time`;
    const params = day ? [planId, day] : [planId];
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar viajes' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Viaje no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener viaje' });
  }
});

router.post('/extra', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.status(400).json({ error: 'No hay plan activo' });
    const { day, scheduled_time, supplier, tons, is_critical } = req.body || {};
    if (!day || !scheduled_time || !supplier || tons == null) {
      return res.status(400).json({ error: 'Faltan: day, scheduled_time, supplier, tons' });
    }
    const maxNum = await pool.query('SELECT COALESCE(MAX(trip_number), 0) + 1 AS n FROM trips WHERE plan_id = $1', [planId]);
    const tripNumber = maxNum.rows[0].n;
    const r = await pool.query(
      `INSERT INTO trips (plan_id, trip_number, day, scheduled_time, supplier, tons, is_critical, is_extra)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
      [planId, tripNumber, day, scheduled_time, supplier, Number(tons), !!is_critical]
    );
    const trip = r.rows[0];
    await notifyWebhooks('trip_extra_added', trip);
    res.status(201).json(trip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear viaje extra' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { day, scheduled_time, supplier, tons, is_critical, delay_h, new_time, status } = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (day != null) { updates.push(`day = $${i++}`); values.push(day); }
    if (scheduled_time != null) { updates.push(`scheduled_time = $${i++}`); values.push(scheduled_time); }
    if (supplier != null) { updates.push(`supplier = $${i++}`); values.push(supplier); }
    if (tons != null) { updates.push(`tons = $${i++}`); values.push(Number(tons)); }
    if (is_critical != null) { updates.push(`is_critical = $${i++}`); values.push(!!is_critical); }
    if (delay_h != null) { updates.push(`delay_h = $${i++}`); values.push(Number(delay_h)); }
    if (new_time != null) { updates.push(`new_time = $${i++}`); values.push(new_time); }
    if (status != null) { updates.push(`status = $${i++}`); values.push(status); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    const r = await pool.query(
      `UPDATE trips SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Viaje no encontrado' });
    const updated = r.rows[0];
    await notifyWebhooks('trip_updated', updated);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar viaje' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM trips WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Viaje no encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar viaje' });
  }
});

export default router;
