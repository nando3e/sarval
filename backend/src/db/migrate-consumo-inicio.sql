-- Inicio de consumo + nivel inicial: defaults globales (tolva) y override por semana.
--
-- Antes, el motor empezaba la semana a las 06:00 hardcodeado y mezclaba dos
-- conceptos: cuándo pueden llegar camiones y cuándo empieza el consumo. Ahora:
--   - La semana/recepción de camiones va de Lunes 00:00 a Sábado 22:00.
--   - "Inicio de consumo" (por defecto 06:00) es configurable: antes de esa hora
--     los camiones suben nivel pero no hay consumo.
--
-- Defaults globales en `tolvas` (editables en la vista Tolvas):
--   - hora_inicio_consumo  (TIME, defecto 06:00)
--   - nivel_inicial_tn     (ya existía)
--
-- Override por semana y por tolva en `plan_tolva_settings` (editable desde
-- Productividad). Campos NULL = heredar el valor de la tolva.
--
-- Idempotente.

-- 1) Default global de inicio de consumo en la tolva.
ALTER TABLE tolvas
  ADD COLUMN IF NOT EXISTS hora_inicio_consumo TIME NOT NULL DEFAULT '06:00';

-- 2) Override por semana y tolva.
CREATE TABLE IF NOT EXISTS plan_tolva_settings (
  id                  SERIAL PRIMARY KEY,
  plan_id             INTEGER NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
  tolva_id            INTEGER NOT NULL REFERENCES tolvas(id)       ON DELETE CASCADE,
  hora_inicio_consumo TIME,        -- NULL = heredar de tolvas.hora_inicio_consumo
  nivel_inicial_tn    NUMERIC,     -- NULL = heredar de tolvas.nivel_inicial_tn
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plan_id, tolva_id)
);
