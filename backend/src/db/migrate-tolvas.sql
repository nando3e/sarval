-- =============================================================
-- MIGRACIÓN: Sistema multi-tolva
-- Ejecutar una vez sobre la base de datos existente.
-- Crea la tabla tolvas, migra los parámetros actuales a la
-- primera tolva, y añade tolva_id a trips, sequence_results
-- y silo_simulation (renombrada a tolva_simulation).
-- =============================================================

BEGIN;

-- 1. Crear tabla de tolvas
CREATE TABLE IF NOT EXISTS tolvas (
  id            SERIAL PRIMARY KEY,
  numero        INT NOT NULL UNIQUE,
  nombre        VARCHAR(255) NOT NULL DEFAULT '',
  capacidad_tn  NUMERIC NOT NULL DEFAULT 40,
  consumo_tn_h  NUMERIC NOT NULL DEFAULT 12,
  nivel_inicial_tn NUMERIC NOT NULL DEFAULT 20,
  paso_minutos  INT NOT NULL DEFAULT 30,
  nivel_minimo_alerta_tn NUMERIC DEFAULT NULL,
  max_espera_critico_h   NUMERIC DEFAULT NULL,
  activa        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tolvas IS 'Tolvas de la planta. Cada una tiene sus propios parámetros de simulación.';

-- 2. Crear tolva por defecto (numero 1) con los parámetros actuales
--    La columna value en parameters ya es NUMERIC.
INSERT INTO tolvas (numero, nombre, capacidad_tn, consumo_tn_h, nivel_inicial_tn, paso_minutos)
SELECT
  1,
  'Tolva 1',
  COALESCE((SELECT value FROM parameters WHERE key = 'Capacidad_silo_tn'), 40),
  COALESCE((SELECT value FROM parameters WHERE key = 'Consumo_tn_h'), 12),
  COALESCE((SELECT value FROM parameters WHERE key = 'Nivel_inicial_tn'), 20),
  COALESCE((SELECT value FROM parameters WHERE key = 'Paso_minutos'), 30)::INT
WHERE NOT EXISTS (SELECT 1 FROM tolvas WHERE numero = 1);

-- 3. Añadir tolva_id a trips (nullable durante migración, luego NOT NULL)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS tolva_id INT;

-- Asignar todos los viajes existentes a la tolva 1
UPDATE trips SET tolva_id = (SELECT id FROM tolvas WHERE numero = 1)
WHERE tolva_id IS NULL;

-- Hacer la columna NOT NULL y añadir FK
ALTER TABLE trips ALTER COLUMN tolva_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_trips_tolva') THEN
    ALTER TABLE trips ADD CONSTRAINT fk_trips_tolva
      FOREIGN KEY (tolva_id) REFERENCES tolvas(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 4. Añadir tolva_id a sequence_results
ALTER TABLE sequence_results ADD COLUMN IF NOT EXISTS tolva_id INT;

UPDATE sequence_results SET tolva_id = (SELECT id FROM tolvas WHERE numero = 1)
WHERE tolva_id IS NULL;

ALTER TABLE sequence_results ALTER COLUMN tolva_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_sequence_results_tolva') THEN
    ALTER TABLE sequence_results ADD CONSTRAINT fk_sequence_results_tolva
      FOREIGN KEY (tolva_id) REFERENCES tolvas(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 5. Añadir tolva_id a silo_simulation
ALTER TABLE silo_simulation ADD COLUMN IF NOT EXISTS tolva_id INT;

UPDATE silo_simulation SET tolva_id = (SELECT id FROM tolvas WHERE numero = 1)
WHERE tolva_id IS NULL;

ALTER TABLE silo_simulation ALTER COLUMN tolva_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_silo_simulation_tolva') THEN
    ALTER TABLE silo_simulation ADD CONSTRAINT fk_silo_simulation_tolva
      FOREIGN KEY (tolva_id) REFERENCES tolvas(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 6. Índices para consultas por tolva
CREATE INDEX IF NOT EXISTS idx_trips_tolva_id ON trips (tolva_id);
CREATE INDEX IF NOT EXISTS idx_sequence_results_tolva_id ON sequence_results (tolva_id);
CREATE INDEX IF NOT EXISTS idx_silo_simulation_tolva_id ON silo_simulation (tolva_id);

COMMIT;
