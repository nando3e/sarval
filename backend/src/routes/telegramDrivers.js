import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

/** GET /api/telegram-drivers — lista de choferes */
router.get('/', async (_req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, telegram_id, telefono, nombre_chofer, created_at FROM telegram_drivers ORDER BY nombre_chofer'
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar choferes' });
  }
});

/** POST /api/telegram-drivers — crear chofer (telegram_id como string para BIGINT) */
router.post('/', async (req, res) => {
  try {
    const { telegram_id, nombre_chofer, telefono } = req.body || {};
    const tidStr = telegram_id != null ? String(telegram_id).trim() : '';
    if (!/^\d+$/.test(tidStr) || tidStr === '') {
      return res.status(400).json({ error: 'telegram_id obligatorio y debe ser un número entero' });
    }
    if (!nombre_chofer || String(nombre_chofer).trim() === '') {
      return res.status(400).json({ error: 'nombre_chofer es obligatorio' });
    }
    const r = await pool.query(
      `INSERT INTO telegram_drivers (telegram_id, telefono, nombre_chofer)
       VALUES ($1::BIGINT, $2, $3)
       RETURNING id, telegram_id, telefono, nombre_chofer, created_at`,
      [tidStr, telefono ? String(telefono).trim() || null : null, String(nombre_chofer).trim()]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un chofer con ese telegram_id' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al crear chofer' });
  }
});

/** PUT /api/telegram-drivers/:id — actualizar chofer */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });
    const { nombre_chofer, telefono } = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (nombre_chofer !== undefined) {
      updates.push(`nombre_chofer = $${i++}`);
      values.push(String(nombre_chofer).trim());
    }
    if (telefono !== undefined) {
      updates.push(`telefono = $${i++}`);
      values.push(telefono === '' || telefono == null ? null : String(telefono).trim());
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    updates.push(`updated_at = NOW()`);
    values.push(id);
    const r = await pool.query(
      `UPDATE telegram_drivers SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, telegram_id, telefono, nombre_chofer, created_at`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Chofer no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar chofer' });
  }
});

/** DELETE /api/telegram-drivers/:id */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });
    const r = await pool.query('DELETE FROM telegram_drivers WHERE id = $1 RETURNING id', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Chofer no encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar chofer' });
  }
});

export default router;
