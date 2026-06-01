import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { authMiddleware } from './middleware/auth.js';
import { openapiSpec } from './docs/openapi.js';
import authRoutes from './routes/auth.js';
import parametersRoutes from './routes/parameters.js';
import planningRoutes from './routes/planning.js';
import dashboardRoutes from './routes/dashboard.js';
import tripsRoutes from './routes/trips.js';
import uploadRoutes from './routes/upload.js';
import settingsRoutes from './routes/settings.js';
import webhooksRoutes from './routes/webhooks.js';
import proveedoresRoutes from './routes/proveedores.js';
import telegramDriversRoutes from './routes/telegramDrivers.js';
import tolvasRoutes from './routes/tolvas.js';
import stoppagesRoutes from './routes/stoppages.js';
import boxEntriesRoutes from './routes/boxEntries.js';
import levelReadingsRoutes from './routes/levelReadings.js';
import productivityPeriodsRoutes from './routes/productivityPeriods.js';
import planTolvaSettingsRoutes from './routes/planTolvaSettings.js';
import personalPlantaRoutes from './routes/personalPlanta.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Documentación OpenAPI (Swagger UI). Abierta por defecto; para cerrarla
// detrás de JWT poner OPENAPI_PUBLIC=false en .env.
app.get('/api/docs.json', (_req, res) => res.json(openapiSpec));
const docsGuard = process.env.OPENAPI_PUBLIC === 'false' ? authMiddleware : (_req, _res, next) => next();
app.use('/api/docs', docsGuard, swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: 'SARVAL API',
  swaggerOptions: { persistAuthorization: true },
}));

// Endpoint publico minimo para que el front pueda saber, antes del login, si
// debe mostrar la marca SARVAL o ir en modo anonimizado (demo).
app.get('/api/branding', async (_req, res) => {
  try {
    const pool = (await import('./db/pool.js')).default;
    const r = await pool.query("SELECT value FROM app_settings WHERE key = 'anonimizar' LIMIT 1");
    res.json({ anonimizar: r.rows[0]?.value === 'true' });
  } catch (err) {
    console.error(err);
    res.json({ anonimizar: false });
  }
});

app.use('/api/auth', authRoutes);

// Rutas protegidas
app.use('/api/parameters', authMiddleware, parametersRoutes);
app.use('/api/planning', authMiddleware, planningRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/trips', authMiddleware, tripsRoutes);
app.use('/api/planning/upload', authMiddleware, uploadRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/webhooks', authMiddleware, webhooksRoutes);
app.use('/api/proveedores', authMiddleware, proveedoresRoutes);
app.use('/api/telegram-drivers', authMiddleware, telegramDriversRoutes);
app.use('/api/tolvas', authMiddleware, tolvasRoutes);
app.use('/api/stoppages', authMiddleware, stoppagesRoutes);
app.use('/api/box-entries', authMiddleware, boxEntriesRoutes);
app.use('/api/level-readings', authMiddleware, levelReadingsRoutes);
app.use('/api/productivity-periods', authMiddleware, productivityPeriodsRoutes);
app.use('/api/plan-tolva-settings', authMiddleware, planTolvaSettingsRoutes);
app.use('/api/personal-planta', authMiddleware, personalPlantaRoutes);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((_req, res) => res.status(404).json({ error: 'No encontrado' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(PORT, () => {
  console.log(`Sarval API listening on http://localhost:${PORT}`);
});
