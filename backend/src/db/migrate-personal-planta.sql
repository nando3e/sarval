-- Migración FASE F: Personal de planta para notificaciones
CREATE TABLE IF NOT EXISTS personal_planta (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(255) NOT NULL,
  rol             VARCHAR(100) NOT NULL DEFAULT '',
  telefono        VARCHAR(50) DEFAULT NULL,
  email           VARCHAR(255) DEFAULT NULL,
  canal_preferido VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  recibir_alertas BOOLEAN NOT NULL DEFAULT true,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE personal_planta IS 'Personal de planta que recibe notificaciones de alertas via webhook/chatbot.';
