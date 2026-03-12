import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

/** GET /api/proveedores — lista de proveedores (activos por defecto; ?activo=false para inactivos, sin query para todos) */
router.get('/', async (req, res) => {
  try {
    const activo = req.query.activo;
    let q = 'SELECT id, nombre, activo, created_at FROM proveedores';
    const params = [];
    if (activo === 'true' || activo === 'false') {
      params.push(activo === 'true');
      q += ' WHERE activo = $1';
    }
    q += ' ORDER BY nombre';
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar proveedores' });
  }
});

/** POST /api/proveedores — crear proveedor */
router.post('/', async (req, res) => {
  try {
    const { nombre, activo } = req.body || {};
    if (!nombre || String(nombre).trim() === '') {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    const r = await pool.query(
      'INSERT INTO proveedores (nombre, activo) VALUES ($1, $2) RETURNING id, nombre, activo, created_at',
      [String(nombre).trim(), activo !== false]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

/** PUT /api/proveedores/:id — actualizar proveedor */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });
    const { nombre, activo } = req.body || {};
    const updates = [];
    const values = [];
    let i = 1;
    if (nombre !== undefined) {
      updates.push(`nombre = $${i++}`);
      values.push(String(nombre).trim());
    }
    if (activo !== undefined) {
      updates.push(`activo = $${i++}`);
      values.push(!!activo);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    values.push(id);
    const r = await pool.query(
      `UPDATE proveedores SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, nombre, activo, created_at`,
      values
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

/** DELETE /api/proveedores/:id — desactivar (soft) para no romper FK en telegram_drivers */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Id inválido' });
    const r = await pool.query(
      'UPDATE proveedores SET activo = false WHERE id = $1 RETURNING id',
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

export default router;
