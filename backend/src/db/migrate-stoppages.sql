-- Migración FASE D: Paradas programadas / averías
CREATE TABLE IF NOT EXISTS stoppages (
  id          SERIAL PRIMARY KEY,
  tolva_id    INT NOT NULL REFERENCES tolvas(id),
  plan_id     INT REFERENCES weekly_plans(id),
  tipo        VARCHAR(50) NOT NULL DEFAULT 'mantenimiento',
  descripcion TEXT NOT NULL DEFAULT '',
  dia         VARCHAR(20) NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin    TIME NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stoppages_tolva_plan ON stoppages (tolva_id, plan_id);

COMMENT ON TABLE stoppages IS 'Paradas programadas o averías por tolva. Durante la parada la productividad es 0 tn/h.';
