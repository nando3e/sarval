-- Tablas para el bot de Telegram (n8n): proveedores + conductores identificados por Telegram.
-- Ejecutar una vez en la base de datos del proyecto.

-- Catálogo de proveedores (editable desde el frontend). El bot ofrecerá esta lista al registrar un chofer.
CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE proveedores IS 'Catálogo de proveedores para asignar a choferes (Telegram). Editable desde el frontend.';

-- Conductores identificados por Telegram (registro desde el bot en n8n).
-- No están ligados a un proveedor: un día se les asigna una ruta, otro día otra.
CREATE TABLE IF NOT EXISTS telegram_drivers (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  telefono VARCHAR(50) NULL,
  nombre_chofer VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_drivers_telegram_id ON telegram_drivers (telegram_id);

COMMENT ON TABLE telegram_drivers IS 'Choferes registrados vía bot Telegram. No tienen proveedor fijo; las rutas se asignan por día.';
