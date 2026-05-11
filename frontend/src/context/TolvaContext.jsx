import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const TolvaContext = createContext(null);

export function TolvaProvider({ children }) {
  const [tolvas, setTolvas] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadTolvas = useCallback(() => {
    setLoading(true);
    return api('/api/tolvas')
      .then(setTolvas)
      .catch(() => setTolvas([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTolvas(); }, [loadTolvas]);

  return (
    <TolvaContext.Provider value={{ tolvas, loading, loadTolvas }}>
      {children}
    </TolvaContext.Provider>
  );
}

export function useTolvas() {
  const ctx = useContext(TolvaContext);
  if (!ctx) throw new Error('useTolvas must be used within TolvaProvider');
  return ctx;
}
