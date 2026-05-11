import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const FIELDS = 'id, nombre, rol, telefono, email, canal_preferido, recibir_alertas, activo, created_at';

router.get('/', async (req, res) => {
  try {
    const all = req.query.todos === 'true';
    const where = all ? '' : ' WHERE activo = true';
    const r = await pool.query(`SELECT ${FIELDS} FROM personal_planta${where} ORDER BY nombre`);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar personal de planta' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, rol, telefono, email, canal_preferido, recibir_alertas } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const r = await pool.query(
      `INSERT INTO personal_planta (nombre, rol, telefono, email, canal_preferido, recibir_alertas)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FIELDS}`,
      [nombre.trim(), rol || '', telefono || null, email || null, canal_preferido || 'whatsapp', recibir_alertas !== false]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear personal' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, rol, telefono, email, canal_preferido, recibir_alertas, activo } = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (nombre != null) { updates.push(`nombre = $${i++}`); values.push(nombre.trim()); }
    if (rol != null) { updates.push(`rol = $${i++}`); values.push(rol); }
    if (telefono !== undefined) { updates.push(`telefono = $${i++}`); values.push(telefono || null); }
    if (email !== undefined) { updates.push(`email = $${i++}`); values.push(email || null); }
    if (canal_preferido != null) { updates.push(`canal_preferido = $${i++}`); values.push(canal_preferido); }
    if (recibir_alertas != null) { updates.push(`recibir_alertas = $${i++}`); values.push(!!recibir_alertas); }
    if (activo != null) { updates.push(`activo = $${i++}`); values.push(!!activo); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(req.params.id);
    const r = await pool.query(
      `UPDATE personal_planta SET ${updates.join(', ')} WHERE id = $${i} RETURNING ${FIELDS}`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Persona no encontrada' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar personal' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM personal_planta WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Persona no encontrada' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar personal' });
  }
});

export default router;
