import { Router } from 'express';
import pool from '../db/pool.js';
import { resolvePlanId } from '../db/helpers.js';
import { recalcPlan } from '../services/recalc.js';

const router = Router();

const FIELDS = 'p.id, p.tolva_id, p.plan_id, p.dia, p.hora_inicio, p.hora_fin, p.consumo_tn_h, p.created_at';
const FIELDS_PLAIN = 'id, tolva_id, plan_id, dia, hora_inicio, hora_fin, consumo_tn_h, created_at';

router.get('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.json([]);
    const tolvaId = req.query.tolva_id ? parseInt(req.query.tolva_id, 10) : null;
    let q = `SELECT ${FIELDS}, tol.numero AS tolva_numero, tol.nombre AS tolva_nombre
             FROM productivity_periods p LEFT JOIN tolvas tol ON tol.id = p.tolva_id
             WHERE p.plan_id = $1`;
    const params = [planId];
    if (tolvaId) { q += ' AND p.tolva_id = $2'; params.push(tolvaId); }
    q += ' ORDER BY p.tolva_id, p.dia, p.hora_inicio';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar franjas de productividad' });
  }
});

router.post('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.status(400).json({ error: 'No hay plan activo' });
    const { tolva_id, dia, hora_inicio, hora_fin, consumo_tn_h } = req.body || {};
    if (!tolva_id || !dia || !hora_inicio || !hora_fin || consumo_tn_h == null) {
      return res.status(400).json({ error: 'Faltan campos: tolva_id, dia, hora_inicio, hora_fin, consumo_tn_h' });
    }
    if (String(hora_fin).slice(0, 5) <= String(hora_inicio).slice(0, 5)) {
      return res.status(400).json({ error: 'La hora de fin debe ser posterior a la de inicio' });
    }
    const r = await pool.query(
      `INSERT INTO productivity_periods (tolva_id, plan_id, dia, hora_inicio, hora_fin, consumo_tn_h)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FIELDS_PLAIN}`,
      [parseInt(tolva_id, 10), planId, dia, hora_inicio, hora_fin, Number(consumo_tn_h)]
    );
    await recalcPlan(planId, { trigger: 'productivity_create' });
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear franja de productividad' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { dia, hora_inicio, hora_fin, consumo_tn_h } = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (dia != null) { updates.push(`dia = $${i++}`); values.push(dia); }
    if (hora_inicio != null) { updates.push(`hora_inicio = $${i++}`); values.push(hora_inicio); }
    if (hora_fin != null) { updates.push(`hora_fin = $${i++}`); values.push(hora_fin); }
    if (consumo_tn_h != null) { updates.push(`consumo_tn_h = $${i++}`); values.push(Number(consumo_tn_h)); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    const r = await pool.query(
      `UPDATE productivity_periods SET ${updates.join(', ')} WHERE id = $${i} RETURNING ${FIELDS_PLAIN}`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Franja no encontrada' });
    const updated = r.rows[0];
    if (updated.plan_id) await recalcPlan(updated.plan_id, { trigger: 'productivity_update' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar franja de productividad' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM productivity_periods WHERE id = $1 RETURNING id, plan_id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Franja no encontrada' });
    if (r.rows[0].plan_id) await recalcPlan(r.rows[0].plan_id, { trigger: 'productivity_delete' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar franja de productividad' });
  }
});

export default router;
