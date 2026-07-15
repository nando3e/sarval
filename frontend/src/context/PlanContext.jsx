import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const [weeks, setWeeks] = useState({ vigente: null, proxima: null, pasadas: [] });
  const [planId, setPlanIdState] = useState(null);
  const [loadingWeeks, setLoadingWeeks] = useState(true);

  // Modo simulación: cuando hay un clon activo, planId apunta a él y TODA la
  // app trabaja sobre el clon sin enterarse (el ruteo por plan_id ya existía).
  const [simulation, setSimulation] = useState(null); // { id, parentId } | null
  const [pendingResume, setPendingResume] = useState(null); // simulación abierta detectada al cargar
  const prevPlanRef = useRef(undefined); // plan que se veía antes de simular (undefined = desconocido)

  const isSimulating = simulation != null;

  const loadWeeks = useCallback(() => {
    setLoadingWeeks(true);
    api('/api/planning/weeks')
      .then((data) => setWeeks(data))
      .catch(() => setWeeks({ vigente: null, proxima: null, pasadas: [] }))
      .finally(() => setLoadingWeeks(false));
  }, []);

  useEffect(() => {
    loadWeeks();
  }, [loadWeeks]);

  // ¿Quedó una simulación abierta de una sesión anterior (refresh, cierre)?
  useEffect(() => {
    api('/api/planning/simulation/mine')
      .then((sim) => {
        if (sim && sim.simulation_plan_id) setPendingResume(sim);
      })
      .catch(() => {});
  }, []);

  const setPlanId = useCallback((id) => {
    setPlanIdState(id ?? null);
    if (typeof window !== 'undefined') {
      window.__SARVAL_PLAN_ID = id != null ? String(id) : '';
    }
  }, []);

  useEffect(() => {
    window.__SARVAL_PLAN_ID = planId != null ? String(planId) : '';
  }, [planId]);

  /** Sale del modo simulación restaurando la semana que se veía antes. */
  const exitSimulation = useCallback(
    (parentId) => {
      let restore = prevPlanRef.current;
      if (restore === undefined) {
        // Simulación retomada tras un refresh: volver al padre (próxima) o a la vigente.
        restore = parentId != null && parentId === weeks.proxima?.id ? parentId : null;
      }
      prevPlanRef.current = undefined;
      setSimulation(null);
      setPlanId(restore ?? null);
    },
    [weeks, setPlanId]
  );

  /** Entra en modo simulación clonando el plan que se está viendo. */
  const startSimulation = useCallback(async () => {
    try {
      const body = planId != null ? { plan_id: planId } : {};
      const data = await api('/api/planning/simulation', { method: 'POST', body: JSON.stringify(body) });
      prevPlanRef.current = planId;
      setSimulation({ id: data.simulation_plan_id, parentId: data.parent_plan_id });
      setPlanId(data.simulation_plan_id);
      setPendingResume(null);
    } catch (err) {
      // 409: ya hay una simulación abierta de este usuario → retomarla.
      const mine = await api('/api/planning/simulation/mine').catch(() => null);
      if (mine && mine.simulation_plan_id) {
        prevPlanRef.current = planId;
        setSimulation({ id: mine.simulation_plan_id, parentId: mine.parent_plan_id });
        setPlanId(mine.simulation_plan_id);
        setPendingResume(null);
        return;
      }
      throw err;
    }
  }, [planId, setPlanId]);

  /** Retoma la simulación abierta detectada al cargar la app. */
  const resumeSimulation = useCallback(() => {
    if (!pendingResume) return;
    prevPlanRef.current = undefined;
    setSimulation({ id: pendingResume.simulation_plan_id, parentId: pendingResume.parent_plan_id });
    setPlanId(pendingResume.simulation_plan_id);
    setPendingResume(null);
  }, [pendingResume, setPlanId]);

  /** Descarta la simulación pendiente de retomar (sin entrar en ella). */
  const discardPendingSimulation = useCallback(async () => {
    if (!pendingResume) return;
    await api(`/api/planning/simulation/${pendingResume.simulation_plan_id}`, { method: 'DELETE' });
    setPendingResume(null);
  }, [pendingResume]);

  /** Aplica los cambios simulados al plan real y sale del modo simulación. */
  const applySimulation = useCallback(async () => {
    if (!simulation) return null;
    const result = await api(`/api/planning/simulation/${simulation.id}/apply`, { method: 'POST' });
    exitSimulation(simulation.parentId);
    loadWeeks();
    return result;
  }, [simulation, exitSimulation, loadWeeks]);

  /** Cancela la simulación: borra el clon sin tocar el plan real. */
  const cancelSimulation = useCallback(async () => {
    if (!simulation) return;
    await api(`/api/planning/simulation/${simulation.id}`, { method: 'DELETE' });
    exitSimulation(simulation.parentId);
  }, [simulation, exitSimulation]);

  const value = {
    weeks,
    planId,
    setPlanId,
    loadWeeks,
    loadingWeeks,
    simulation,
    isSimulating,
    pendingResume,
    startSimulation,
    resumeSimulation,
    discardPendingSimulation,
    applySimulation,
    cancelSimulation,
  };
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
