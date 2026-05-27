import { Router } from 'express';
import pool from '../db/pool.js';
import { resolvePlanId } from '../db/helpers.js';
import { recalcPlan } from '../services/recalc.js';

const router = Router();

const TOLVA_FIELDS = 'id, numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos, nivel_minimo_alerta_tn, max_espera_critico_h, activa, created_at';

/** GET /api/tolvas — lista de tolvas (activas por defecto; ?todas=true para incluir inactivas) */
router.get('/', async (req, res) => {
  try {
    const todas = req.query.todas === 'true';
    const q = todas
      ? `SELECT ${TOLVA_FIELDS} FROM tolvas ORDER BY numero`
      : `SELECT ${TOLVA_FIELDS} FROM tolvas WHERE activa = true ORDER BY numero`;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar tolvas' });
  }
});

/** GET /api/tolvas/:id — detalle de una tolva */
router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT ${TOLVA_FIELDS} FROM tolvas WHERE id = $1`, [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Tolva no encontrada' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tolva' });
  }
});

/** POST /api/tolvas — crear tolva */
router.post('/', async (req, res) => {
  try {
    const { numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos, nivel_minimo_alerta_tn, max_espera_critico_h } = req.body || {};
    if (numero == null || Number.isNaN(Number(numero))) {
      return res.status(400).json({ error: 'El número de tolva es obligatorio' });
    }
    const r = await pool.query(
      `INSERT INTO tolvas (numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos, nivel_minimo_alerta_tn, max_espera_critico_h)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${TOLVA_FIELDS}`,
      [
        Number(numero),
        String(nombre || `Tolva ${numero}`).trim(),
        Number(capacidad_tn) || 40,
        Number(consumo_tn_h) || 12,
        Number(nivel_inicial_tn) || 20,
        Number(paso_minutos) || 30,
        nivel_minimo_alerta_tn != null ? Number(nivel_minimo_alerta_tn) : null,
        max_espera_critico_h != null ? Number(max_espera_critico_h) : null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe una tolva con ese número' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al crear tolva' });
  }
});

/** PUT /api/tolvas/:id — actualizar tolva */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });
    const { nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos, nivel_minimo_alerta_tn, max_espera_critico_h, activa } = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (nombre !== undefined) { updates.push(`nombre = $${i++}`); values.push(String(nombre).trim()); }
    if (capacidad_tn !== undefined) { updates.push(`capacidad_tn = $${i++}`); values.push(Number(capacidad_tn)); }
    if (consumo_tn_h !== undefined) { updates.push(`consumo_tn_h = $${i++}`); values.push(Number(consumo_tn_h)); }
    if (nivel_inicial_tn !== undefined) { updates.push(`nivel_inicial_tn = $${i++}`); values.push(Number(nivel_inicial_tn)); }
    if (paso_minutos !== undefined) { updates.push(`paso_minutos = $${i++}`); values.push(Number(paso_minutos)); }
    if (nivel_minimo_alerta_tn !== undefined) { updates.push(`nivel_minimo_alerta_tn = $${i++}`); values.push(nivel_minimo_alerta_tn != null ? Number(nivel_minimo_alerta_tn) : null); }
    if (max_espera_critico_h !== undefined) { updates.push(`max_espera_critico_h = $${i++}`); values.push(max_espera_critico_h != null ? Number(max_espera_critico_h) : null); }
    if (activa !== undefined) { updates.push(`activa = $${i++}`); values.push(!!activa); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(id);
    const r = await pool.query(
      `UPDATE tolvas SET ${updates.join(', ')} WHERE id = $${i} RETURNING ${TOLVA_FIELDS}`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Tolva no encontrada' });
    // Los parámetros de la tolva (capacidad, consumo, paso, nivel inicial)
    // afectan a la simulación: recalcula el plan que el cliente esté viendo.
    const affectsSim = ['capacidad_tn', 'consumo_tn_h', 'nivel_inicial_tn', 'paso_minutos', 'activa'].some((k) => req.body?.[k] !== undefined);
    if (affectsSim) {
      const planId = await resolvePlanId(req);
      if (planId) await recalcPlan(planId, { trigger: 'tolva_params' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar tolva' });
  }
});

/** DELETE /api/tolvas/:id — desactivar (soft) para no romper FK en trips */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });
    const r = await pool.query(
      'UPDATE tolvas SET activa = false WHERE id = $1 RETURNING id',
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Tolva no encontrada' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al desactivar tolva' });
  }
});

export default router;
