import { Router } from 'express';
import pool from '../db/pool.js';
import { resolvePlanId } from '../db/helpers.js';

const router = Router();

const FIELDS = 'id, tolva_id, plan_id, num_boxes, total_tons, periodo_horas, dia, hora_inicio, descripcion, created_at';

router.get('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.json([]);
    const tolvaId = req.query.tolva_id ? parseInt(req.query.tolva_id, 10) : null;
    let q = `SELECT b.${FIELDS}, tol.numero AS tolva_numero, tol.nombre AS tolva_nombre
             FROM box_entries b LEFT JOIN tolvas tol ON tol.id = b.tolva_id
             WHERE b.plan_id = $1`;
    const params = [planId];
    if (tolvaId) { q += ' AND b.tolva_id = $2'; params.push(tolvaId); }
    q += ' ORDER BY b.tolva_id, b.dia, b.hora_inicio';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar entradas de boxes' });
  }
});

router.post('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.status(400).json({ error: 'No hay plan activo' });
    const { tolva_id, num_boxes, total_tons, periodo_horas, dia, hora_inicio, descripcion } = req.body || {};
    if (!tolva_id || !dia || total_tons == null) {
      return res.status(400).json({ error: 'Faltan campos: tolva_id, dia, total_tons' });
    }
    const r = await pool.query(
      `INSERT INTO box_entries (tolva_id, plan_id, num_boxes, total_tons, periodo_horas, dia, hora_inicio, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${FIELDS}`,
      [
        parseInt(tolva_id, 10),
        planId,
        Number(num_boxes) || 1,
        Number(total_tons),
        Number(periodo_horas) || 24,
        dia,
        hora_inicio || '06:00',
        descripcion || '',
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear entrada de boxes' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { num_boxes, total_tons, periodo_horas, dia, hora_inicio, descripcion } = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (num_boxes != null) { updates.push(`num_boxes = $${i++}`); values.push(Number(num_boxes)); }
    if (total_tons != null) { updates.push(`total_tons = $${i++}`); values.push(Number(total_tons)); }
    if (periodo_horas != null) { updates.push(`periodo_horas = $${i++}`); values.push(Number(periodo_horas)); }
    if (dia != null) { updates.push(`dia = $${i++}`); values.push(dia); }
    if (hora_inicio != null) { updates.push(`hora_inicio = $${i++}`); values.push(hora_inicio); }
    if (descripcion != null) { updates.push(`descripcion = $${i++}`); values.push(descripcion); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    const r = await pool.query(
      `UPDATE box_entries SET ${updates.join(', ')} WHERE id = $${i} RETURNING ${FIELDS}`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Entrada no encontrada' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar entrada de boxes' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM box_entries WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Entrada no encontrada' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar entrada de boxes' });
  }
});

export default router;
