import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const BrandingContext = createContext(null);

const APP_NAME = 'SARVAL';
const APP_NAME_ANON = 'Planificador de descargas';

export function BrandingProvider({ children }) {
  const [anonimizar, setAnonimizar] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/branding');
      if (!r.ok) return;
      const data = await r.json();
      setAnonimizar(Boolean(data?.anonimizar));
    } catch {
      // si falla, dejamos los valores actuales
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const appName = anonimizar ? APP_NAME_ANON : APP_NAME;
    document.title = anonimizar ? appName : `${appName} - Planificador de Descargas`;
  }, [anonimizar]);

  const value = {
    anonimizar,
    loaded,
    appName: anonimizar ? APP_NAME_ANON : APP_NAME,
    refresh,
    setAnonimizar,
  };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used within BrandingProvider');
  return ctx;
}
