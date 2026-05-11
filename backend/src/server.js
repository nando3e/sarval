import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth.js';
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
import personalPlantaRoutes from './routes/personalPlanta.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

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
