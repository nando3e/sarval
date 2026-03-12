import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const [weeks, setWeeks] = useState({ vigente: null, proxima: null, pasadas: [] });
  const [planId, setPlanIdState] = useState(null);
  const [loadingWeeks, setLoadingWeeks] = useState(true);

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

  const setPlanId = useCallback((id) => {
    setPlanIdState(id ?? null);
    if (typeof window !== 'undefined') {
      window.__SARVAL_PLAN_ID = id != null ? String(id) : '';
    }
  }, []);

  useEffect(() => {
    window.__SARVAL_PLAN_ID = planId != null ? String(planId) : '';
  }, [planId]);

  const value = { weeks, planId, setPlanId, loadWeeks, loadingWeeks };
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used within PlanProvider');
  return ctx;
}
