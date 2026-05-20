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
    const tolvaId = req.query.tolva_id ? parseInt(req.query.tolva_id, 10) : null;
    let q = `SELECT t.*, tol.numero AS tolva_numero, tol.nombre AS tolva_nombre
             FROM trips t LEFT JOIN tolvas tol ON tol.id = t.tolva_id
             WHERE t.plan_id = $1`;
    const params = [planId];
    let i = 2;
    if (day) { q += ` AND t.day = $${i++}`; params.push(day); }
    if (tolvaId) { q += ` AND t.tolva_id = $${i++}`; params.push(tolvaId); }
    q += ` ORDER BY t.tolva_id, ${DAY_ORDER_SQL}, t.scheduled_time`;
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
    const { trip_number, day, scheduled_time, supplier, tons, is_critical, tolva_id } = req.body || {};
    const tripNumber = String(trip_number ?? '').trim();
    if (!tripNumber || !day || !scheduled_time || !supplier || tons == null || !tolva_id) {
      return res.status(400).json({ error: 'Faltan: trip_number, day, scheduled_time, supplier, tons, tolva_id' });
    }
    const dup = await pool.query('SELECT 1 FROM trips WHERE plan_id = $1 AND trip_number = $2 LIMIT 1', [planId, tripNumber]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: `Ya existe un viaje con la matrícula "${tripNumber}" en esta semana` });
    }
    const r = await pool.query(
      `INSERT INTO trips (plan_id, trip_number, day, scheduled_time, supplier, tons, is_critical, is_extra, tolva_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8) RETURNING *`,
      [planId, tripNumber, day, scheduled_time, supplier, Number(tons), !!is_critical, parseInt(tolva_id, 10)]
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
    const { day, scheduled_time, supplier, tons, is_critical, delay_h, new_time, status, tolva_id } = req.body || {};
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
    if (tolva_id != null) { updates.push(`tolva_id = $${i++}`); values.push(parseInt(tolva_id, 10)); }
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

router.post('/:id/divert', async (req, res) => {
  try {
    const { tolva_id } = req.body || {};
    if (!tolva_id) return res.status(400).json({ error: 'Falta tolva_id destino' });
    const targetTolva = parseInt(tolva_id, 10);

    const tripRow = await pool.query(
      `SELECT t.*, tol.numero AS old_tolva_numero, tol.nombre AS old_tolva_nombre
       FROM trips t LEFT JOIN tolvas tol ON tol.id = t.tolva_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (tripRow.rows.length === 0) return res.status(404).json({ error: 'Viaje no encontrado' });
    const trip = tripRow.rows[0];

    if (trip.tolva_id === targetTolva) {
      return res.status(400).json({ error: 'El viaje ya está en esa tolva' });
    }

    const destRow = await pool.query('SELECT id, numero, nombre FROM tolvas WHERE id = $1 AND activa = true', [targetTolva]);
    if (destRow.rows.length === 0) return res.status(400).json({ error: 'Tolva destino no encontrada o inactiva' });
    const destTolva = destRow.rows[0];

    await pool.query('UPDATE trips SET tolva_id = $1 WHERE id = $2', [targetTolva, trip.id]);

    const { run } = await import('../engine/simulator.js');
    const affectedTolvaIds = [trip.tolva_id, targetTolva];

    for (const tid of affectedTolvaIds) {
      const tolvaRow = await pool.query('SELECT * FROM tolvas WHERE id = $1', [tid]);
      if (tolvaRow.rows.length === 0) continue;
      const tolva = tolvaRow.rows[0];

      const tripsRows = await pool.query(
        `SELECT id, trip_number, day, scheduled_time, supplier, tons, is_critical, is_extra
         FROM trips WHERE plan_id = $1 AND tolva_id = $2 ORDER BY ${DAY_ORDER_SQL}, scheduled_time`,
        [trip.plan_id, tid]
      );
      const tolvaTrips = tripsRows.rows.map((t) => ({
        ...t,
        scheduled_time: t.scheduled_time != null ? String(t.scheduled_time).slice(0, 5) : '00:00',
      }));

      await pool.query('DELETE FROM sequence_results WHERE plan_id = $1 AND tolva_id = $2', [trip.plan_id, tid]);
      await pool.query('DELETE FROM silo_simulation WHERE plan_id = $1 AND tolva_id = $2', [trip.plan_id, tid]);

      if (tolvaTrips.length === 0) continue;
      const stoppagesRows = await pool.query(
        'SELECT dia, hora_inicio, hora_fin FROM stoppages WHERE plan_id = $1 AND tolva_id = $2',
        [trip.plan_id, tid]
      );
      const boxRows = await pool.query(
        'SELECT total_tons, periodo_horas, dia, hora_inicio FROM box_entries WHERE plan_id = $1 AND tolva_id = $2',
        [trip.plan_id, tid]
      );
      const { sequence, simulation } = run(tolva, tolvaTrips, stoppagesRows.rows, boxRows.rows);

      if (sequence.length > 0) {
        const seqValues = sequence.map((_, i) => {
          const o = i * 7;
          return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7})`;
        }).join(', ');
        const seqParams = sequence.flatMap((r) => [trip.plan_id, r.trip_id, r.final_day, r.final_time, r.delay_capacity_hours, !!r.retained_for_critical, tid]);
        await pool.query(
          `INSERT INTO sequence_results (plan_id, trip_id, final_day, final_time, delay_capacity_hours, retained_for_critical, tolva_id) VALUES ${seqValues}`,
          seqParams
        );
      }

      if (simulation.length > 0) {
        const batchSize = 100;
        for (let b = 0; b < simulation.length; b += batchSize) {
          const batch = simulation.slice(b, b + batchSize);
          const simValues = batch.map((_, i) => {
            const o = i * 10;
            return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9}, $${o + 10})`;
          }).join(', ');
          const simParams = batch.flatMap((r) => [trip.plan_id, r.step_index, r.day, r.time, r.entries_tons, r.box_entry_tons || 0, r.consumption_tons, r.silo_level, r.is_stoppage, tid]);
          await pool.query(
            `INSERT INTO silo_simulation (plan_id, step_index, day, time, entries_tons, box_entry_tons, consumption_tons, silo_level, is_stoppage, tolva_id) VALUES ${simValues}`,
            simParams
          );
        }
      }
    }

    await notifyWebhooks('trip_diverted', {
      trip_id: trip.id,
      trip_number: trip.trip_number,
      supplier: trip.supplier,
      tons: trip.tons,
      is_critical: trip.is_critical,
      from_tolva: { id: trip.tolva_id, numero: trip.old_tolva_numero, nombre: trip.old_tolva_nombre },
      to_tolva: { id: destTolva.id, numero: destTolva.numero, nombre: destTolva.nombre },
    });

    res.json({
      message: 'Viaje desviado y recalculado',
      trip_id: trip.id,
      from_tolva_id: trip.tolva_id,
      to_tolva_id: targetTolva,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al desviar viaje' });
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
