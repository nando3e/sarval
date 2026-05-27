-- =============================================================
-- Migración: franjas de productividad por tolva y plan
-- La productividad (consumo t/h) no siempre es fija: varía por turnos.
-- Cada franja define un caudal para un tramo (día + hora_inicio..hora_fin).
-- Donde no hay franja, el motor usa el consumo_tn_h base de la tolva.
-- En solapamientos gana la franja creada más tarde (mayor id).
-- =============================================================

CREATE TABLE IF NOT EXISTS productivity_periods (
  id            SERIAL PRIMARY KEY,
  tolva_id      INT NOT NULL REFERENCES tolvas(id),
  plan_id       INT REFERENCES weekly_plans(id),
  dia           VARCHAR(20) NOT NULL,
  hora_inicio   TIME NOT NULL,
  hora_fin      TIME NOT NULL,
  consumo_tn_h  NUMERIC NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productivity_periods_tolva_plan ON productivity_periods (tolva_id, plan_id);

COMMENT ON TABLE productivity_periods IS 'Franjas horarias con caudal de consumo (t/h) por tolva y plan. Sustituyen al consumo base en su tramo.';
