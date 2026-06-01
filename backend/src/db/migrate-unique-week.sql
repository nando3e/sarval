-- Prevención de planes semanales duplicados.
--
-- Causa raíz: getActivePlanId() y el endpoint /weeks insertaban un plan nuevo
-- cuando no encontraban uno, sin unicidad ni atomicidad. Bajo varias peticiones
-- concurrentes (el Dashboard lanza ~5 a la vez) se creaban varios planes para la
-- misma semana. Sin esta restricción, el bug puede repetirse cada arranque de
-- semana.
--
-- Esta migración:
--   1) Resuelve los duplicados existentes por week_start, conservando el plan
--      con MÁS viajes (y, a igualdad, el activo / el de mayor id) y borrando el
--      resto junto con TODOS sus datos hijos.
--   2) Añade UNIQUE (week_start): la BBDD pasa a rechazar físicamente un segundo
--      plan para la misma semana.
--
-- Idempotente: si ya no hay duplicados y la restricción existe, no hace nada.

BEGIN;

-- 1) Planes "perdedores" por week_start (todos menos el ganador de cada semana).
CREATE TEMP TABLE _losers ON COMMIT DROP AS
  SELECT id FROM (
    SELECT wp.id,
           ROW_NUMBER() OVER (
             PARTITION BY wp.week_start
             ORDER BY (SELECT count(*) FROM trips t WHERE t.plan_id = wp.id) DESC,
                      (wp.status = 'active') DESC,
                      wp.id DESC
           ) AS rn
    FROM weekly_plans wp
  ) r
  WHERE r.rn > 1;

-- Borrar datos hijos de los perdedores (explícito, sin depender de FK CASCADE).
DELETE FROM sequence_results    WHERE plan_id IN (SELECT id FROM _losers);
DELETE FROM silo_simulation     WHERE plan_id IN (SELECT id FROM _losers);
DELETE FROM trips               WHERE plan_id IN (SELECT id FROM _losers);
DELETE FROM stoppages           WHERE plan_id IN (SELECT id FROM _losers);
DELETE FROM box_entries         WHERE plan_id IN (SELECT id FROM _losers);
DELETE FROM level_readings      WHERE plan_id IN (SELECT id FROM _losers);
DELETE FROM productivity_periods WHERE plan_id IN (SELECT id FROM _losers);
DELETE FROM weekly_plans        WHERE id IN (SELECT id FROM _losers);

-- 2) Restricción de unicidad: una semana = un plan (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_plans_week_start_unique'
  ) THEN
    ALTER TABLE weekly_plans
      ADD CONSTRAINT weekly_plans_week_start_unique UNIQUE (week_start);
  END IF;
END $$;

COMMIT;
