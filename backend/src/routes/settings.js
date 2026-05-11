import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

const EUROPE_TIMEZONES = [
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Vienna',
  'Europe/Lisbon',
  'Europe/Athens',
  'Europe/Prague',
  'Europe/Warsaw',
  'Europe/Budapest',
  'Europe/Bucharest',
  'Europe/Sofia',
  'Europe/Helsinki',
  'Europe/Stockholm',
  'Europe/Oslo',
  'Europe/Copenhagen',
  'Europe/Dublin',
  'Europe/Zurich',
  'Europe/Luxembourg',
  'Europe/Malta',
  'Europe/Riga',
  'Europe/Tallinn',
  'Europe/Vilnius',
  'Europe/Bratislava',
  'Europe/Ljubljana',
  'Europe/Zagreb',
  'Europe/Belgrade',
];

const API_ENDPOINTS = [
  { method: 'POST', path: '/api/auth/login', description: 'Login (obtener token)' },
  { method: 'GET', path: '/api/tolvas', description: 'Listar tolvas' },
  { method: 'POST', path: '/api/tolvas', description: 'Crear tolva' },
  { method: 'PUT', path: '/api/tolvas/:id', description: 'Actualizar tolva' },
  { method: 'GET', path: '/api/trips', description: 'Listar viajes' },
  { method: 'GET', path: '/api/trips?day=Lunes', description: 'Viajes por día' },
  { method: 'GET', path: '/api/trips?tolva_id=1', description: 'Viajes por tolva' },
  { method: 'GET', path: '/api/trips/:id', description: 'Un viaje' },
  { method: 'POST', path: '/api/trips/extra', description: 'Añadir viaje extra' },
  { method: 'PUT', path: '/api/trips/:id', description: 'Actualizar viaje (incl. tolva_id)' },
  { method: 'DELETE', path: '/api/trips/:id', description: 'Eliminar viaje' },
  { method: 'POST', path: '/api/planning/upload', description: 'Subir CSV/Excel' },
  { method: 'GET', path: '/api/planning/sequence', description: 'Secuenciación' },
  { method: 'GET', path: '/api/planning/simulation', description: 'Simulación tolva' },
  { method: 'POST', path: '/api/planning/recalculate', description: 'Recalcular (todas las tolvas)' },
  { method: 'GET', path: '/api/dashboard', description: 'Dashboard' },
  { method: 'GET', path: '/api/dashboard/silo-chart', description: 'Gráfico tolva' },
];

// GET /api/settings - zona horaria, api_base_url, endpoints, etc.
router.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT key, value FROM app_settings');
    const settings = Object.fromEntries(r.rows.map((row) => [row.key, row.value]));
    const baseUrl = settings.api_base_url || (req.protocol + '://' + req.get('host'));
    res.json({
      timezone: settings.timezone || 'Europe/Madrid',
      api_base_url: settings.api_base_url || '',
      timezone_options: EUROPE_TIMEZONES,
      endpoints: API_ENDPOINTS.map((e) => ({ ...e, url: baseUrl.replace(/\/$/, '') + e.path })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const { timezone, api_base_url } = req.body || {};
    if (timezone != null) {
      await pool.query(
        'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        ['timezone', String(timezone)]
      );
    }
    if (api_base_url !== undefined) {
      await pool.query(
        'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        ['api_base_url', String(api_base_url)]
      );
    }
    const r = await pool.query('SELECT key, value FROM app_settings');
    const settings = Object.fromEntries(r.rows.map((row) => [row.key, row.value]));
    res.json({ timezone: settings.timezone, api_base_url: settings.api_base_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

export default router;
export { EUROPE_TIMEZONES };
