import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();
const SUPERADMIN_USER = process.env.SUPERADMIN_USER || 'admin';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'admin';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Superadmin: se valida contra SUPERADMIN_USER y SUPERADMIN_PASSWORD de .env
 * Otros usuarios: contra tabla users (password_hash con bcrypt)
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    // Superadmin hardcodeado desde .env
    if (email === SUPERADMIN_USER && password === SUPERADMIN_PASSWORD) {
      const token = jwt.sign(
        { sub: 'superadmin', email: SUPERADMIN_USER, role: 'superadmin' },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      return res.json({
        token,
        user: { email: SUPERADMIN_USER, role: 'superadmin' },
      });
    }

    // Resto: tabla users (si existe y hay usuarios registrados)
    const pool = (await import('../db/pool.js')).default;
    const r = await pool.query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [email]
    );
    if (r.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    const user = r.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    const token = jwt.sign(
      { sub: String(user.id), email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

export default router;
