-- =============================================================
-- Migracion: tabla app_settings (key/value) para configuracion
-- global de la aplicacion (timezone, api_base_url, anonimizar...).
-- =============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(64) PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE app_settings IS 'Configuracion global key/value de la app.';
