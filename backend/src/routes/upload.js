import { Router } from 'express';
import multer from 'multer';
import pool from '../db/pool.js';
import { resolvePlanId, isSimulationPlan } from '../db/helpers.js';
import { parseFile } from '../services/fileParser.js';
import { notifyWebhooks } from '../services/webhookEmitter.js';
import { recalcPlan } from '../services/recalc.js';

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

    // Resolver tolva: del body, o la primera activa como default
    let defaultTolvaId = req.body?.tolva_id ? parseInt(req.body.tolva_id, 10) : null;
    if (!defaultTolvaId) {
      const tolvaRow = await pool.query('SELECT id FROM tolvas WHERE activa = true ORDER BY numero LIMIT 1');
      defaultTolvaId = tolvaRow.rows[0]?.id ?? null;
    }
    if (!defaultTolvaId) {
      return res.status(400).json({ error: 'No hay tolvas activas. Crea al menos una tolva antes de subir una planificación.' });
    }

    // Mapa de numero de tolva -> id para resolver columna "Tolva" del archivo
    const allTolvas = await pool.query('SELECT id, numero, nombre FROM tolvas WHERE activa = true');
    const tolvaByNum = new Map(allTolvas.rows.map((t) => [t.numero, t.id]));
    const tolvaByName = new Map(allTolvas.rows.map((t) => [t.nombre.toLowerCase().trim(), t.id]));

    await pool.query("DELETE FROM sequence_results WHERE plan_id = $1", [planId]);
    await pool.query("DELETE FROM silo_simulation WHERE plan_id = $1", [planId]);
    await pool.query("DELETE FROM trips WHERE plan_id = $1 AND is_extra = false", [planId]);

    const batchSize = 50;
    for (let b = 0; b < trips.length; b += batchSize) {
      const batch = trips.slice(b, b + batchSize);
      const values = batch.map((_, i) => {
        const o = i * 9;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9})`;
      }).join(', ');
      const params = batch.flatMap((t) => {
        let tid = defaultTolvaId;
        if (t.tolva != null) {
          const num = Number(t.tolva);
          if (!Number.isNaN(num) && tolvaByNum.has(num)) {
            tid = tolvaByNum.get(num);
          } else {
            const byName = tolvaByName.get(String(t.tolva).toLowerCase().trim());
            if (byName) tid = byName;
          }
        }
        return [planId, t.trip_number, t.day, t.scheduled_time, t.supplier, t.tons, t.is_critical, tid, t.producto || ''];
      });
      await pool.query(
        `INSERT INTO trips (plan_id, trip_number, day, scheduled_time, supplier, tons, is_critical, tolva_id, producto)
         VALUES ${values}`,
        params
      );
    }

    // En modo simulación (el plan destino es un clon) no se avisa a nadie:
    // el upload es un cambio ficticio hasta que se aplique la simulación.
    if (!(await isSimulationPlan(planId))) {
      await notifyWebhooks('plan_uploaded', { plan_id: planId, imported: trips.length, parse_errors: errors });
    }
    await recalcPlan(planId, { trigger: 'upload' });
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
