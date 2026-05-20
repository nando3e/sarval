-- =============================================================
-- Migración: trip_number como matrícula alfanumérica única por plan
-- Ejecutar una vez sobre la base de datos existente.
-- =============================================================

BEGIN;

-- 1. Cambiar el tipo de la columna a VARCHAR conservando los valores actuales.
ALTER TABLE trips ALTER COLUMN trip_number TYPE VARCHAR(50)
  USING trip_number::VARCHAR;

ALTER TABLE trips ALTER COLUMN trip_number SET NOT NULL;

-- 2. Unicidad por plan: dentro de la misma semana no pueden repetirse matrículas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_plan_trip_number
  ON trips (plan_id, trip_number);

COMMENT ON COLUMN trips.trip_number IS 'Matrícula del viaje definida por logística. Alfanumérica, única por plan.';

COMMIT;
