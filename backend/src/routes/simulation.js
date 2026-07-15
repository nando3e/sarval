import { Router } from 'express';
import { getActivePlanId, toLocalDateOnly } from '../db/helpers.js';
import {
  clonePlan,
  findOpenSimulation,
  loadSimulation,
  getSimulationDiff,
  applySimulation,
  discardSimulation,
} from '../services/simulationPlans.js';

/**
 * Modo simulación (montado en /api/planning/simulation desde planning.js).
 * El GET sin subruta (pasos del silo) sigue viviendo en planning.js.
 */
const router = Router();

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  const body = { error: err.message || 'Error interno' };
  if (err.simulation) {
    body.simulation_plan_id = err.simulation.id;
    body.parent_plan_id = err.simulation.parent_plan_id;
  }
  res.status(status).json(body);
}

/** El clon debe ser del usuario (o el usuario, superadmin). */
async function loadOwnedSimulation(req, id) {
  const sim = await loadSimulation(id);
  if (sim.simulation_owner !== req.user?.email && req.user?.role !== 'superadmin') {
    const err = new Error('Esta simulación pertenece a otro usuario');
    err.status = 403;
    throw err;
  }
  return sim;
}

function parseId(req) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    const err = new Error('Id de simulación inválido');
    err.status = 400;
    throw err;
  }
  return id;
}

// POST /api/planning/simulation — entrar en modo simulación (clona el plan).
router.post('/', async (req, res) => {
  try {
    const raw = req.body?.plan_id;
    const parentId = raw != null ? parseInt(raw, 10) : await getActivePlanId();
    if (Number.isNaN(parentId)) return res.status(400).json({ error: 'plan_id inválido' });
    const result = await clonePlan(parentId, req.user?.email);
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/planning/simulation/mine — simulación abierta del usuario (o null).
router.get('/mine', async (req, res) => {
  try {
    const sim = await findOpenSimulation(req.user?.email);
    if (!sim) return res.json(null);
    res.json({
      simulation_plan_id: sim.id,
      parent_plan_id: sim.parent_plan_id,
      week_start: toLocalDateOnly(sim.week_start),
      created_at: sim.created_at,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/planning/simulation/:id/diff — resumen de cambios clon vs. real.
router.get('/:id/diff', async (req, res) => {
  try {
    const id = parseId(req);
    await loadOwnedSimulation(req, id);
    res.json(await getSimulationDiff(id));
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/planning/simulation/:id/apply — sobrescribe el plan real y borra el clon.
router.post('/:id/apply', async (req, res) => {
  try {
    const id = parseId(req);
    await loadOwnedSimulation(req, id);
    res.json(await applySimulation(id));
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/planning/simulation/:id — cancela la simulación sin tocar el plan real.
router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(req);
    await loadOwnedSimulation(req, id);
    res.json(await discardSimulation(id));
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
