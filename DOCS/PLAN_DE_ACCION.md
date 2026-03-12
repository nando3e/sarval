# SARVAL - Plan de Acción: App Web Planificador de Descargas

## Visión general

Transformar el sistema actual (Excel + script) en una aplicación web con API REST, preparada para ser operada tanto por personas como por un bot de n8n conectado a WhatsApp/Telegram.

---

## FASE 1: MVP - Replicar el Excel en app web

### 1.1 Base de datos (PostgreSQL)

- Tabla `users`: login con email y contraseña (JWT)
- Tabla `parameters`: los 4 parámetros del silo (capacidad, consumo, nivel inicial, paso)
- Tabla `weekly_plans`: metadatos de cada planificación semanal (fecha inicio, estado)
- Tabla `trips`: TODOS los viajes (base + extras) con todos los campos:
  - trip_number, day, scheduled_time, supplier, tons, is_critical, is_extra
  - delay_h, new_time, status (las 3 columnas que hoy están vacías en Secuenciación)
  - trucker_phone (para el bot futuro)
- Tabla `sequence_results`: resultado del motor para cada viaje:
  - final_day, final_time, delay_capacity_hours
- Tabla `silo_simulation`: los 273 pasos de simulación:
  - step_index, day, time, entries_tons, consumption_tons, silo_level, is_stoppage

### 1.2 Backend (Node.js + Express)

**Motor de simulación** (`engine/simulator.js`):
- Traducción directa del script de Excel a JavaScript
- Misma lógica: colas de prioridad (críticos primero), consumo por paso, retrasos por capacidad
- Entrada: parámetros + lista de viajes
- Salida: secuenciación + simulación del silo + resumen dashboard

**Endpoints API**:

Escritura (modifican datos):
- `POST /api/planning/upload` — Subir planificación semanal (CSV o Excel)
- `POST /api/trips/extra` — Añadir viaje extra
- `PUT /api/trips/:id` — Modificar viaje existente (toneladas, hora, día, crítico, estado, retraso...)
- `DELETE /api/trips/:id` — Cancelar/eliminar viaje
- `PUT /api/parameters` — Cambiar parámetros del silo
- `POST /api/planning/recalculate` — Ejecutar el motor (el "botón ACTUALIZAR")

Lectura (consultas):
- `GET /api/planning/sequence` — Tabla secuenciación completa
- `GET /api/planning/simulation` — Simulación silo paso a paso
- `GET /api/dashboard` — Resumen: horas paradas, stock mínimo, parámetros
- `GET /api/trips` — Lista de viajes (con filtros por día, proveedor, estado...)
- `GET /api/trips/:id` — Detalle de un viaje

Autenticación:
- `POST /api/auth/login` — Login
- `POST /api/auth/register` — Registro (solo admin)

**Servicio de parseo** (`services/fileParser.js`):
- Leer CSV o Excel con la estructura de Planificación Base
- Validar datos: IDs, días válidos, horas, toneladas > 0, etc.
- Insertar en tabla trips con is_extra = false

### 1.3 Frontend (React)

**Páginas**:
- Login
- Dashboard principal:
  - 3 tarjetas: capacidad silo, nivel inicial, consumo
  - 2 tarjetas calculadas: horas paradas totales, stock mínimo
  - Gráfico interactivo del nivel del silo (toda la semana)
- Planificación semanal:
  - Tabla editable con los 77+ viajes
  - Botón "Subir planificación" (CSV/Excel)
  - Edición inline de cualquier celda (toneladas, hora, día, crítico)
- Viajes extras:
  - Formulario para añadir viaje extra
  - Lista de viajes extras activos
- Secuenciación:
  - Tabla con las 15 columnas (incluidas las 3 que hoy están vacías)
  - Resaltado visual de viajes con retraso
  - Indicador de viajes que cambian de día
  - Botón "ACTUALIZAR" (ejecuta el motor)
- Parámetros:
  - Formulario editable para los 4 parámetros del silo

---

## FASE 2: Integración con bot (n8n + WhatsApp/Telegram)

### 2.1 Endpoints para que n8n llame a la API

- `POST /api/trips/extra` — Bot anota viaje extra
- `PUT /api/trips/:id` — Bot anota cambio (kgs, hora, día...)
- `POST /api/trips/:id/confirm` — Camionero confirma su viaje
- `POST /api/trips/:id/arrival` — Camionero avisa que ha llegado
- `POST /api/planning/recalculate` — Bot lanza recálculo
- `GET /api/trips/today` — Bot pide viajes del día para briefing
- `GET /api/delays` — Bot consulta retrasos activos

### 2.2 Webhooks (la app avisa a n8n)

La app llamará a URLs de n8n cuando ocurran eventos:
- `delay_alert`: el recálculo detecta un retraso NUEVO → n8n avisa al camionero afectado
- `stoppage_alert`: el silo va a llegar a 0 → n8n avisa al responsable
- `daily_briefing`: resumen del día (trigger programado)
- `confirmation_request`: pedir confirmación a camioneros de sus viajes del día

### 2.3 Flujo del bot

1. Cada mañana, n8n llama a `GET /api/trips/today`
2. Para cada camionero, envía por WhatsApp/Telegram:
   "Hola, esperamos que llegues hoy con el viaje #XX, XX toneladas a las XX:XX. ¿Confirmas o hay algún cambio?"
3. El camionero responde (confirma, cambia kgs, dice que va tarde...)
4. n8n interpreta la respuesta y llama al endpoint correspondiente
5. Tras los cambios, n8n llama a `POST /api/planning/recalculate`
6. Si hay retrasos nuevos, la app llama al webhook de n8n para avisar

---

## FASE 3: Funcionalidades avanzadas (futuro)

- Histórico de semanas anteriores
- Comparador de planificaciones (antes/después de cambios)
- Estadísticas y reportes (horas paradas por semana, proveedores más frecuentes, etc.)
- Roles de usuario (admin, operador, solo lectura)
- Notificaciones push en la app web
- App móvil para camioneros

---

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Backend | Node.js + Express |
| Base de datos | PostgreSQL |
| Frontend | React + Tailwind CSS |
| Gráficos | Recharts (gráfico del silo) |
| Autenticación | JWT |
| Parseo Excel/CSV | xlsx (librería npm) |
| Bot | n8n (externo, se conecta vía API/webhooks) |

---

## Orden de implementación

1. Inicializar proyecto (backend + frontend + base de datos)
2. Crear schema de base de datos y seed de parámetros por defecto
3. Traducir el motor de simulación del script a JavaScript
4. Implementar endpoints de API (auth, trips, planning, parameters, dashboard)
5. Implementar parseo de CSV/Excel para subida de planificación
6. Construir frontend: login, dashboard, tablas, formularios
7. Preparar endpoints y webhooks para integración con n8n
8. Testing: verificar que la app produce los mismos resultados que el Excel
