import { Router } from 'express';
import pool from '../db/pool.js';
import { resolvePlanId } from '../db/helpers.js';
import { recalcPlan } from '../services/recalc.js';

const router = Router();

const FIELDS = 'r.id, r.tolva_id, r.plan_id, r.dia, r.hora, r.nivel_tn, r.nota, r.created_at';
const FIELDS_PLAIN = 'id, tolva_id, plan_id, dia, hora, nivel_tn, nota, created_at';

router.get('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.json([]);
    const tolvaId = req.query.tolva_id ? parseInt(req.query.tolva_id, 10) : null;
    let q = `SELECT ${FIELDS}, tol.numero AS tolva_numero, tol.nombre AS tolva_nombre
             FROM level_readings r LEFT JOIN tolvas tol ON tol.id = r.tolva_id
             WHERE r.plan_id = $1`;
    const params = [planId];
    if (tolvaId) { q += ' AND r.tolva_id = $2'; params.push(tolvaId); }
    q += ' ORDER BY r.tolva_id, r.dia, r.hora';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar lecturas de nivel' });
  }
});

router.post('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.status(400).json({ error: 'No hay plan activo' });
    const { tolva_id, dia, hora, nivel_tn, nota } = req.body || {};
    if (!tolva_id || !dia || !hora || nivel_tn == null) {
      return res.status(400).json({ error: 'Faltan campos: tolva_id, dia, hora, nivel_tn' });
    }
    const r = await pool.query(
      `INSERT INTO level_readings (tolva_id, plan_id, dia, hora, nivel_tn, nota)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FIELDS_PLAIN}`,
      [parseInt(tolva_id, 10), planId, dia, hora, Number(nivel_tn), nota || '']
    );
    await recalcPlan(planId, { trigger: 'level_reading' });
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear lectura de nivel' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM level_readings WHERE id = $1 RETURNING id, plan_id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Lectura no encontrada' });
    if (r.rows[0].plan_id) await recalcPlan(r.rows[0].plan_id, { trigger: 'level_reading_delete' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar lectura de nivel' });
  }
});

export default router;
