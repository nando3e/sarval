-- =============================================================
-- Migración: añadir columna producto a trips
-- Ejecutar una vez sobre la base de datos existente.
-- =============================================================

BEGIN;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS producto VARCHAR(255) NOT NULL DEFAULT '';

COMMENT ON COLUMN trips.producto IS 'Producto / tipo de carga del viaje. Obligatorio en nuevos viajes desde la app o el CSV.';

COMMIT;
