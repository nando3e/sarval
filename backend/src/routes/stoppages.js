import { Router } from 'express';
import pool from '../db/pool.js';
import { resolvePlanId } from '../db/helpers.js';
import { notifyWebhooks } from '../services/webhookEmitter.js';

const router = Router();

const FIELDS = 's.id, s.tolva_id, s.plan_id, s.tipo, s.descripcion, s.dia, s.hora_inicio, s.hora_fin, s.created_at';
const FIELDS_PLAIN = 'id, tolva_id, plan_id, tipo, descripcion, dia, hora_inicio, hora_fin, created_at';

router.get('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.json([]);
    const tolvaId = req.query.tolva_id ? parseInt(req.query.tolva_id, 10) : null;
    let q = `SELECT ${FIELDS}, tol.numero AS tolva_numero, tol.nombre AS tolva_nombre
             FROM stoppages s LEFT JOIN tolvas tol ON tol.id = s.tolva_id
             WHERE s.plan_id = $1`;
    const params = [planId];
    if (tolvaId) { q += ' AND s.tolva_id = $2'; params.push(tolvaId); }
    q += ' ORDER BY s.tolva_id, s.dia, s.hora_inicio';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar paradas' });
  }
});

router.post('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.status(400).json({ error: 'No hay plan activo' });
    const { tolva_id, tipo, descripcion, dia, hora_inicio, hora_fin } = req.body || {};
    if (!tolva_id || !dia || !hora_inicio || !hora_fin) {
      return res.status(400).json({ error: 'Faltan campos: tolva_id, dia, hora_inicio, hora_fin' });
    }
    const r = await pool.query(
      `INSERT INTO stoppages (tolva_id, plan_id, tipo, descripcion, dia, hora_inicio, hora_fin)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${FIELDS_PLAIN}`,
      [parseInt(tolva_id, 10), planId, tipo || 'mantenimiento', descripcion || '', dia, hora_inicio, hora_fin]
    );
    const stoppage = r.rows[0];
    await notifyWebhooks('stoppage_created', stoppage);
    res.status(201).json(stoppage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear parada' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { tipo, descripcion, dia, hora_inicio, hora_fin } = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (tipo != null) { updates.push(`tipo = $${i++}`); values.push(tipo); }
    if (descripcion != null) { updates.push(`descripcion = $${i++}`); values.push(descripcion); }
    if (dia != null) { updates.push(`dia = $${i++}`); values.push(dia); }
    if (hora_inicio != null) { updates.push(`hora_inicio = $${i++}`); values.push(hora_inicio); }
    if (hora_fin != null) { updates.push(`hora_fin = $${i++}`); values.push(hora_fin); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    const r = await pool.query(
      `UPDATE stoppages SET ${updates.join(', ')} WHERE id = $${i} RETURNING ${FIELDS_PLAIN}`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Parada no encontrada' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar parada' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM stoppages WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Parada no encontrada' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar parada' });
  }
});

export default router;
