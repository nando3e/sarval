-- Modo simulación: planes clon con status = 'simulation'.
--
-- Un clon comparte week_start con su plan real, así que la restricción
-- UNIQUE(week_start) (migrate-unique-week.sql) pasa a ser un índice único
-- PARCIAL que excluye las simulaciones: sigue habiendo un único plan REAL
-- por semana, pero pueden convivir N clones de simulación sobre ella.
--
-- IMPORTANTE: los ON CONFLICT (week_start) de helpers.js y planning.js deben
-- llevar el predicado `WHERE status <> 'simulation'` para casar con este
-- índice parcial (se actualizan en el mismo cambio que esta migración).
--
-- Columnas nuevas en weekly_plans (solo pobladas en clones):
--   parent_plan_id   → de qué plan real es clon (para "aplicar").
--   simulation_owner → email del usuario dueño de la simulación.
--   base_fingerprint → hash del contenido del padre al clonar (aviso de
--                      "el plan base cambió" en el diff/aplicar).
--
-- Idempotente: re-ejecutable sin efecto.

BEGIN;

ALTER TABLE weekly_plans DROP CONSTRAINT IF EXISTS weekly_plans_week_start_unique;

CREATE UNIQUE INDEX IF NOT EXISTS weekly_plans_week_start_real
  ON weekly_plans (week_start)
  WHERE status <> 'simulation';

ALTER TABLE weekly_plans ADD COLUMN IF NOT EXISTS parent_plan_id INTEGER;
ALTER TABLE weekly_plans ADD COLUMN IF NOT EXISTS simulation_owner TEXT;
ALTER TABLE weekly_plans ADD COLUMN IF NOT EXISTS base_fingerprint TEXT;

COMMIT;
