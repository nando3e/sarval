-- Migración FASE E: Entradas graduales de boxes/contenedores
CREATE TABLE IF NOT EXISTS box_entries (
  id             SERIAL PRIMARY KEY,
  tolva_id       INT NOT NULL REFERENCES tolvas(id),
  plan_id        INT REFERENCES weekly_plans(id),
  num_boxes      INT NOT NULL DEFAULT 1,
  total_tons     NUMERIC NOT NULL,
  periodo_horas  NUMERIC NOT NULL DEFAULT 24,
  dia            VARCHAR(20) NOT NULL,
  hora_inicio    TIME NOT NULL DEFAULT '06:00',
  descripcion    TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_box_entries_tolva_plan ON box_entries (tolva_id, plan_id);

COMMENT ON TABLE box_entries IS 'Entradas graduales de boxes/contenedores en tolva. Las toneladas se reparten linealmente durante periodo_horas.';
