import { Router } from 'express';
import multer from 'multer';
import pool from '../db/pool.js';
import { resolvePlanId } from '../db/helpers.js';
import { parseFile } from '../services/fileParser.js';
import { notifyWebhooks } from '../services/webhookEmitter.js';

const router = Router();
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha enviado ningún archivo.' });
    }

    const { trips, errors } = parseFile(req.file.buffer, req.file.originalname);

    if (trips.length === 0) {
      return res.status(400).json({ error: 'No se han podido extraer viajes del archivo.', parse_errors: errors });
    }

    const planId = await resolvePlanId(req);

    await pool.query("DELETE FROM sequence_results WHERE plan_id = $1", [planId]);
    await pool.query("DELETE FROM silo_simulation WHERE plan_id = $1", [planId]);
    await pool.query("DELETE FROM trips WHERE plan_id = $1 AND is_extra = false", [planId]);

    const batchSize = 50;
    for (let b = 0; b < trips.length; b += batchSize) {
      const batch = trips.slice(b, b + batchSize);
      const values = batch.map((_, i) => {
        const o = i * 7;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7})`;
      }).join(', ');
      const params = batch.flatMap((t) => [
        planId, t.trip_number, t.day, t.scheduled_time, t.supplier, t.tons, t.is_critical,
      ]);
      await pool.query(
        `INSERT INTO trips (plan_id, trip_number, day, scheduled_time, supplier, tons, is_critical)
         VALUES ${values}`,
        params
      );
    }

    await notifyWebhooks('plan_uploaded', { plan_id: planId, imported: trips.length, parse_errors: errors });
    res.json({
      message: `Planificación cargada: ${trips.length} viajes importados.`,
      plan_id: planId,
      imported: trips.length,
      parse_errors: errors,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar el archivo.' });
  }
});

export default router;
