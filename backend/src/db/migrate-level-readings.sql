-- =============================================================
-- Migración: lecturas manuales de nivel de silo
-- Las tolvas no tienen células de pesada. El operario registra
-- periódicamente el nivel real medido; cada lectura "reancla" la
-- simulación en ese instante y recalcula la secuencia hacia adelante.
-- =============================================================

CREATE TABLE IF NOT EXISTS level_readings (
  id          SERIAL PRIMARY KEY,
  tolva_id    INT NOT NULL REFERENCES tolvas(id),
  plan_id     INT REFERENCES weekly_plans(id),
  dia         VARCHAR(20) NOT NULL,
  hora        TIME NOT NULL,
  nivel_tn    NUMERIC NOT NULL,
  nota        VARCHAR(255) DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_level_readings_tolva_plan ON level_readings (tolva_id, plan_id);

COMMENT ON TABLE level_readings IS 'Lecturas manuales de nivel de silo. Cada una reancla la simulación de su tolva en su día/hora.';
