import { Router } from 'express';
import pool from '../db/pool.js';
import { resolvePlanId } from '../db/helpers.js';
import { recalcPlan } from '../services/recalc.js';

const router = Router();

/**
 * Overrides por semana (plan) y tolva: inicio de consumo y nivel inicial.
 * NULL en un campo = heredar el valor por defecto de la tolva.
 *
 * GET /api/plan-tolva-settings → por cada tolva activa, el valor por defecto de
 *   la tolva y el override de la semana (si existe). Pensado para la vista
 *   Productividad, que muestra el valor efectivo (override ?? defecto).
 */
router.get('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.json([]);
    const r = await pool.query(
      `SELECT t.id AS tolva_id, t.numero AS tolva_numero, t.nombre AS tolva_nombre,
              t.hora_inicio_consumo AS default_hora_inicio_consumo,
              t.nivel_inicial_tn   AS default_nivel_inicial_tn,
              s.hora_inicio_consumo AS override_hora_inicio_consumo,
              s.nivel_inicial_tn   AS override_nivel_inicial_tn
       FROM tolvas t
       LEFT JOIN plan_tolva_settings s ON s.tolva_id = t.id AND s.plan_id = $1
       WHERE t.activa = true
       ORDER BY t.numero`,
      [planId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ajustes por semana' });
  }
});

/**
 * PUT /api/plan-tolva-settings → upsert del override de una tolva para la semana.
 * Body: { tolva_id, hora_inicio_consumo?, nivel_inicial_tn? }.
 * Enviar null en un campo lo deja heredando el valor de la tolva. Recalcula.
 */
router.put('/', async (req, res) => {
  try {
    const planId = await resolvePlanId(req);
    if (!planId) return res.status(400).json({ error: 'No hay plan activo' });
    const { tolva_id } = req.body || {};
    if (!tolva_id) return res.status(400).json({ error: 'Falta tolva_id' });

    // null/'' explícito = limpiar override (heredar). undefined = no tocar... pero
    // como es un upsert simple, tratamos ausente como null (heredar).
    const horaRaw = req.body.hora_inicio_consumo;
    const nivelRaw = req.body.nivel_inicial_tn;
    const hora = horaRaw == null || String(horaRaw).trim() === '' ? null : String(horaRaw);
    const nivel = nivelRaw == null || String(nivelRaw).trim() === '' ? null : Number(nivelRaw);

    const r = await pool.query(
      `INSERT INTO plan_tolva_settings (plan_id, tolva_id, hora_inicio_consumo, nivel_inicial_tn)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (plan_id, tolva_id)
       DO UPDATE SET hora_inicio_consumo = EXCLUDED.hora_inicio_consumo,
                     nivel_inicial_tn   = EXCLUDED.nivel_inicial_tn
       RETURNING id, plan_id, tolva_id, hora_inicio_consumo, nivel_inicial_tn`,
      [planId, parseInt(tolva_id, 10), hora, nivel]
    );
    await recalcPlan(planId, { trigger: 'plan_tolva_settings' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar ajustes por semana' });
  }
});

export default router;
