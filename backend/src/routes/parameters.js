import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const r = await pool.query('SELECT key, value, description FROM parameters ORDER BY key');
    const params = Object.fromEntries(r.rows.map((row) => [row.key, Number(row.value)]));
    res.json(params);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al leer parámetros' });
  }
});

router.put('/', async (req, res) => {
  try {
    const { Capacidad_silo_tn, Consumo_tn_h, Nivel_inicial_tn, Paso_minutos } = req.body || {};
    const updates = [
      ['Capacidad_silo_tn', Capacidad_silo_tn],
      ['Consumo_tn_h', Consumo_tn_h],
      ['Nivel_inicial_tn', Nivel_inicial_tn],
      ['Paso_minutos', Paso_minutos],
    ].filter(([, v]) => v != null && !Number.isNaN(Number(v)));
    for (const [key, value] of updates) {
      await pool.query('UPDATE parameters SET value = $1 WHERE key = $2', [Number(value), key]);
    }
    const r = await pool.query('SELECT key, value FROM parameters ORDER BY key');
    const params = Object.fromEntries(r.rows.map((row) => [row.key, Number(row.value)]));
    res.json(params);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar parámetros' });
  }
});

export default router;
