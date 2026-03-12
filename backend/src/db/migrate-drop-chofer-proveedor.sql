-- Quitar relación chofer–proveedor: los conductores no pertenecen a un proveedor fijo.
ALTER TABLE telegram_drivers DROP COLUMN IF EXISTS proveedor_id;
