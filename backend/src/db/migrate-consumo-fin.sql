-- Fin de la ventana de consumo (Sábado), por defecto 22:00 y editable en Tolvas.
--
-- Junto con hora_inicio_consumo (Lunes), define la ventana de consumo base:
-- Lunes hora_inicio_consumo → Sábado hora_fin_consumo. Fuera de esa ventana no
-- hay consumo base; una franja de productividad puede activar consumo en
-- cualquier día/hora (incluido el finde) a su caudal.
--
-- Idempotente.
ALTER TABLE tolvas
  ADD COLUMN IF NOT EXISTS hora_fin_consumo TIME NOT NULL DEFAULT '22:00';
