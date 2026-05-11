-- Migración FASE B: Anticipación de críticos
-- Añade columna para marcar viajes retenidos por anticipación de un crítico.
ALTER TABLE sequence_results
  ADD COLUMN IF NOT EXISTS retained_for_critical BOOLEAN NOT NULL DEFAULT false;
