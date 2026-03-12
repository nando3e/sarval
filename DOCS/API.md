# SARVAL — Documentación de la API

**Base URL local:** `http://localhost:4000`  
**Formato:** JSON (excepto el endpoint de subida de archivos, que usa `multipart/form-data`)  
**Autenticación:** JWT Bearer token en todas las rutas excepto `POST /api/auth/login`

---

## Cómo autenticarse

1. Llama a `POST /api/auth/login` con el usuario y contraseña.
2. Guarda el campo `token` de la respuesta.
3. En el resto de llamadas añade la cabecera:
   ```
   Authorization: Bearer <token>
   ```

---

## Índice

| Grupo | Método | Ruta |
|---|---|---|
| Auth | POST | `/api/auth/login` |
| Parámetros | GET | `/api/parameters` |
| Parámetros | PUT | `/api/parameters` |
| Viajes | GET | `/api/trips` |
| Viajes | GET | `/api/trips/:id` |
| Viajes | POST | `/api/trips/extra` |
| Viajes | PUT | `/api/trips/:id` |
| Viajes | DELETE | `/api/trips/:id` |
| Planificación | POST | `/api/planning/upload` |
| Planificación | GET | `/api/planning/sequence` |
| Planificación | GET | `/api/planning/simulation` |
| Planificación | POST | `/api/planning/recalculate` |
| Dashboard | GET | `/api/dashboard` |
| Dashboard | GET | `/api/dashboard/silo-chart` |
| Configuración | GET | `/api/settings` |
| Configuración | PUT | `/api/settings` |
| Webhooks | GET | `/api/webhooks` |
| Webhooks | GET | `/api/webhooks/events` |
| Webhooks | POST | `/api/webhooks` |
| Webhooks | PUT | `/api/webhooks/:id` |
| Webhooks | DELETE | `/api/webhooks/:id` |

---

## Auth

### `POST /api/auth/login`

Obtiene un token JWT. No requiere autenticación previa.

Acepta el superadmin hardcodeado en `.env` (`SUPERADMIN_USER` / `SUPERADMIN_PASSWORD`) o usuarios de la tabla `users` (contraseña con bcrypt).

**Body:**
```json
{
  "email": "adminsarval",
  "password": "adminsarva123"
}
```

**Respuesta 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "email": "adminsarval",
    "role": "superadmin"
  }
}
```

**Errores:**
- `400` — email o contraseña vacíos
- `401` — credenciales incorrectas

**curl:**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"adminsarval","password":"adminsarva123"}'
```

---

## Parámetros del silo

### `GET /api/parameters`

Devuelve los 4 parámetros de configuración del silo.

**Respuesta 200:**
```json
{
  "Capacidad_silo_tn": 40,
  "Consumo_tn_h": 12,
  "Nivel_inicial_tn": 20,
  "Paso_minutos": 30
}
```

**curl:**
```bash
curl http://localhost:4000/api/parameters \
  -H "Authorization: Bearer <token>"
```

---

### `PUT /api/parameters`

Actualiza uno o varios parámetros del silo. Solo se modifican los campos enviados.

**Body (todos opcionales):**
```json
{
  "Capacidad_silo_tn": 50,
  "Consumo_tn_h": 14,
  "Nivel_inicial_tn": 25,
  "Paso_minutos": 30
}
```

**Respuesta 200:** igual que `GET /api/parameters` con los valores actualizados.

**curl:**
```bash
curl -X PUT http://localhost:4000/api/parameters \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"Capacidad_silo_tn":50,"Consumo_tn_h":14}'
```

---

## Viajes

Los viajes pertenecen siempre al **plan activo** de la semana vigente. Los días válidos son: `Lunes`, `Martes`, `Miércoles`, `Jueves`, `Viernes`, `Sábado`.

### `GET /api/trips`

Lista todos los viajes del plan activo, ordenados por día (Lunes→Sábado) y hora.

**Query params opcionales:**
- `day=Lunes` — filtra por día concreto

**Respuesta 200:**
```json
[
  {
    "id": 1,
    "plan_id": 3,
    "trip_number": 1,
    "day": "Lunes",
    "scheduled_time": "07:00",
    "supplier": "PROVEEDOR A",
    "tons": 22.5,
    "is_critical": false,
    "is_extra": false,
    "delay_h": null,
    "new_time": null,
    "status": "pending"
  }
]
```

**curl:**
```bash
# Todos los viajes
curl http://localhost:4000/api/trips \
  -H "Authorization: Bearer <token>"

# Solo los del lunes
curl "http://localhost:4000/api/trips?day=Lunes" \
  -H "Authorization: Bearer <token>"
```

---

### `GET /api/trips/:id`

Devuelve un viaje concreto por su ID.

**Respuesta 200:** objeto viaje (mismo formato que el array de `GET /api/trips`).

**curl:**
```bash
curl http://localhost:4000/api/trips/1 \
  -H "Authorization: Bearer <token>"
```

---

### `POST /api/trips/extra`

Añade un viaje extra al plan activo. Se asigna automáticamente el siguiente `trip_number`. Dispara el webhook `trip_extra_added`.

**Body (obligatorios: `day`, `scheduled_time`, `supplier`, `tons`):**
```json
{
  "day": "Martes",
  "scheduled_time": "10:30",
  "supplier": "PROVEEDOR B",
  "tons": 18.0,
  "is_critical": false
}
```

**Respuesta 201:** objeto viaje creado.
```json
{
  "id": 25,
  "plan_id": 3,
  "trip_number": 25,
  "day": "Martes",
  "scheduled_time": "10:30",
  "supplier": "PROVEEDOR B",
  "tons": 18,
  "is_critical": false,
  "is_extra": true,
  "delay_h": null,
  "new_time": null,
  "status": "pending"
}
```

**curl:**
```bash
curl -X POST http://localhost:4000/api/trips/extra \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"day":"Martes","scheduled_time":"10:30","supplier":"PROVEEDOR B","tons":18,"is_critical":false}'
```

---

### `PUT /api/trips/:id`

Actualiza campos de un viaje existente. Solo se modifican los campos enviados. Útil para anotar retrasos, cambios de tonelaje, nueva hora, etc. Dispara el webhook `trip_updated`.

**Body (todos opcionales):**
```json
{
  "day": "Miércoles",
  "scheduled_time": "09:00",
  "supplier": "PROVEEDOR C",
  "tons": 20.0,
  "is_critical": true,
  "delay_h": 1.5,
  "new_time": "10:30",
  "status": "delayed"
}
```

> `status` valores posibles: `pending`, `delayed`, `completed`, `cancelled`

**Respuesta 200:** objeto viaje actualizado.

**curl (anotar retraso de 1.5h):**
```bash
curl -X PUT http://localhost:4000/api/trips/25 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"delay_h":1.5,"new_time":"12:00","status":"delayed"}'
```

---

### `DELETE /api/trips/:id`

Elimina un viaje.

**Respuesta:** `204 No Content`

**curl:**
```bash
curl -X DELETE http://localhost:4000/api/trips/25 \
  -H "Authorization: Bearer <token>"
```

---

## Planificación

### `POST /api/planning/upload`

Sube un archivo CSV o Excel (`.csv`, `.xlsx`, `.xls`) con la planificación base semanal.  
Reemplaza todos los viajes base del plan activo (los viajes extra se conservan).  
Borra los resultados de simulación y secuenciación anteriores.  
Dispara el webhook `plan_uploaded`.

**Content-Type:** `multipart/form-data`  
**Campo del archivo:** `file`

**Columnas esperadas en el archivo** (nombres flexibles, se detectan por contenido):
| Columna | Descripción |
|---|---|
| `ID` / `Numero` | Número de viaje (opcional) |
| `Día` / `Day` | Día de la semana (Lunes…Sábado) |
| `Hora` / `Time` | Hora HH:MM |
| `Proveedor` / `Supplier` | Nombre del proveedor |
| `Toneladas` / `Tons` / `Tn` | Toneladas (número) |
| `Crítico` / `Critical` | Sí/Si/true/1 para viaje crítico (opcional) |

**Ejemplo de cabecera y líneas CSV** (separador `;` o `,`; primera fila = cabecera):

```
ID;Día;Hora;Proveedor;Toneladas;Crítico
1;Lunes;07:00;PROVEEDOR A;22,5;
2;Lunes;09:30;PROVEEDOR B;18;Sí
3;Martes;08:00;PROVEEDOR A;20;
```

Días válidos: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado. Hora en formato HH:MM.

**Respuesta 200:**
```json
{
  "message": "Planificación cargada: 24 viajes importados.",
  "plan_id": 3,
  "imported": 24,
  "parse_errors": []
}
```

Si hay filas con errores se devuelven en `parse_errors` pero los viajes válidos sí se importan.

**curl:**
```bash
curl -X POST http://localhost:4000/api/planning/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@planificacion_semana10.xlsx"
```

---

### `GET /api/planning/sequence`

Devuelve la secuenciación de viajes del plan activo (resultado del último recálculo), ordenada por día y hora.

**Respuesta 200:**
```json
[
  {
    "id": 1,
    "trip_number": 1,
    "day": "Lunes",
    "hora_prevista": "07:00",
    "supplier": "PROVEEDOR A",
    "tons": 22.5,
    "critico": false,
    "retraso_h": null,
    "nueva_hora": null,
    "estado": "pending",
    "viaje_extra": false,
    "hora_real": "07:00",
    "clave_hora_real": "Lunes 07:00",
    "dia_final": "Lunes",
    "hora_final": "07:00",
    "retraso_capacidad_h": 0
  }
]
```

> `retraso_capacidad_h > 0` indica que el viaje tuvo que esperar por falta de capacidad en el silo.

**curl:**
```bash
curl http://localhost:4000/api/planning/sequence \
  -H "Authorization: Bearer <token>"
```

---

### `GET /api/planning/simulation`

Devuelve la simulación paso a paso del silo (resultado del último recálculo), ordenada por `step_index`.

**Respuesta 200:**
```json
[
  {
    "step_index": 12,
    "day": "Lunes",
    "time": "06:00",
    "entries_tons": 0,
    "consumption_tons": 6,
    "silo_level": 14,
    "is_stoppage": false
  }
]
```

> `is_stoppage: true` cuando el silo no tenía stock suficiente para el consumo del paso (planta parada).

**curl:**
```bash
curl http://localhost:4000/api/planning/simulation \
  -H "Authorization: Bearer <token>"
```

---

### `POST /api/planning/recalculate`

Ejecuta el motor de simulación con los viajes y parámetros actuales. Recalcula y guarda la secuenciación y la simulación del silo. Dispara los webhooks `recalculate_done` y, si hay retrasos, `delay_detected`.

> **Flujo habitual del bot:** añadir/modificar viajes → llamar a este endpoint.

No requiere body.

**Respuesta 200:**
```json
{
  "message": "Recálculo completado",
  "plan_id": 3,
  "sequence_count": 24,
  "simulation_count": 273
}
```

**Respuesta 400** si no hay viajes en el plan:
```json
{
  "error": "No hay viajes en el plan activo. Sube una planificación o añade viajes."
}
```

**curl:**
```bash
curl -X POST http://localhost:4000/api/planning/recalculate \
  -H "Authorization: Bearer <token>"
```

---

## Dashboard

### `GET /api/dashboard`

Devuelve los KPIs de la semana vigente: parámetros del silo, métricas calculadas y metadatos de la semana.

**Respuesta 200:**
```json
{
  "parameters": {
    "Capacidad_silo_tn": 40,
    "Consumo_tn_h": 12,
    "Nivel_inicial_tn": 20,
    "Paso_minutos": 30
  },
  "horas_paradas": 1.5,
  "stock_minimo": 3.2,
  "total_viajes": 24,
  "viajes_con_retraso": 2,
  "plan_id": 3,
  "week": {
    "week_start": "2026-03-02",
    "week_end": "2026-03-08",
    "week_number": 10,
    "week_label": "Semana 10 · 2 mar. 2026 – 8 mar. 2026",
    "plan_id": 3
  }
}
```

**curl:**
```bash
curl http://localhost:4000/api/dashboard \
  -H "Authorization: Bearer <token>"
```

---

### `GET /api/dashboard/silo-chart`

Devuelve la serie temporal completa paso a paso para el gráfico del silo, enriquecida con timestamps absolutos y metadatos de semana.

**Respuesta 200:**
```json
{
  "week": {
    "week_start": "2026-03-02",
    "week_end": "2026-03-08",
    "week_number": 10,
    "week_label": "Semana 10 · 2 mar. 2026 – 8 mar. 2026"
  },
  "parameters": {
    "Capacidad_silo_tn": 40,
    "Consumo_tn_h": 12,
    "Nivel_inicial_tn": 20,
    "Paso_minutos": 30
  },
  "series": [
    {
      "step_index": 12,
      "day": "Lunes",
      "time": "06:00",
      "label": "Lunes 06:00",
      "day_order": 0,
      "timestamp": 1740906000000,
      "entries_tons": 0,
      "consumption_tons": 6,
      "silo_level": 14,
      "is_stoppage": false
    }
  ]
}
```

> `timestamp` es Unix ms UTC. `day_order`: 0=Lunes, 1=Martes … 5=Sábado.

**curl:**
```bash
curl http://localhost:4000/api/dashboard/silo-chart \
  -H "Authorization: Bearer <token>"
```

---

## Configuración

### `GET /api/settings`

Devuelve la configuración general de la app: zona horaria, URL base y lista de todos los endpoints con URL completa.

**Respuesta 200:**
```json
{
  "timezone": "Europe/Madrid",
  "api_base_url": "https://mi-dominio.com",
  "timezone_options": ["Europe/London", "Europe/Madrid", "..."],
  "endpoints": [
    {
      "method": "POST",
      "path": "/api/auth/login",
      "description": "Login (obtener token)",
      "url": "https://mi-dominio.com/api/auth/login"
    }
  ]
}
```

**curl:**
```bash
curl http://localhost:4000/api/settings \
  -H "Authorization: Bearer <token>"
```

---

### `PUT /api/settings`

Actualiza la zona horaria y/o la URL base de la API.

**Body (ambos opcionales):**
```json
{
  "timezone": "Europe/Berlin",
  "api_base_url": "https://nuevo-dominio.com"
}
```

**Respuesta 200:**
```json
{
  "timezone": "Europe/Berlin",
  "api_base_url": "https://nuevo-dominio.com"
}
```

**curl:**
```bash
curl -X PUT http://localhost:4000/api/settings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"timezone":"Europe/Berlin"}'
```

---

## Webhooks salientes

La app envía un `POST` automático a cada URL de webhook cuando ocurre un evento. Todos los webhooks se configuran aquí.

**Payload que recibe el webhook destino (n8n, etc.):**
```json
{
  "event": "recalculate_done",
  "data": { "plan_id": 3, "sequence_count": 24, "simulation_count": 273 },
  "timestamp": "2026-03-07 10:30:00",
  "timezone": "Europe/Madrid"
}
```

**Eventos disponibles:**

| Clave | Cuándo se dispara |
|---|---|
| `recalculate_done` | Al completar un recálculo |
| `delay_detected` | Si hay viajes con retraso tras un recálculo |
| `trip_extra_added` | Al añadir un viaje extra |
| `trip_updated` | Al actualizar cualquier viaje |
| `plan_uploaded` | Al subir un CSV/Excel |

---

### `GET /api/webhooks`

Lista todos los webhooks configurados.

**Respuesta 200:**
```json
[
  {
    "id": 1,
    "name": "n8n producción",
    "url": "https://n8n.miempresa.com/webhook/sarval",
    "events": ["recalculate_done", "delay_detected"],
    "enabled": true,
    "created_at": "2026-03-07T10:00:00Z"
  }
]
```

**curl:**
```bash
curl http://localhost:4000/api/webhooks \
  -H "Authorization: Bearer <token>"
```

---

### `GET /api/webhooks/events`

Devuelve la lista de eventos disponibles con etiqueta legible.

**Respuesta 200:**
```json
[
  { "key": "recalculate_done", "label": "Recálculo completado" },
  { "key": "delay_detected", "label": "Retraso detectado" },
  { "key": "trip_extra_added", "label": "Viaje extra añadido" },
  { "key": "trip_updated", "label": "Viaje actualizado" },
  { "key": "plan_uploaded", "label": "Planificación subida" }
]
```

**curl:**
```bash
curl http://localhost:4000/api/webhooks/events \
  -H "Authorization: Bearer <token>"
```

---

### `POST /api/webhooks`

Crea un nuevo webhook.

**Body (`url` obligatorio, el resto opcional):**
```json
{
  "name": "n8n producción",
  "url": "https://n8n.miempresa.com/webhook/sarval",
  "events": ["recalculate_done", "delay_detected", "trip_extra_added"]
}
```

**Respuesta 201:** objeto webhook creado.

**curl:**
```bash
curl -X POST http://localhost:4000/api/webhooks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "n8n producción",
    "url": "https://n8n.miempresa.com/webhook/sarval",
    "events": ["recalculate_done", "delay_detected"]
  }'
```

---

### `PUT /api/webhooks/:id`

Actualiza un webhook existente. Solo se modifican los campos enviados.

**Body (todos opcionales):**
```json
{
  "name": "n8n staging",
  "url": "https://n8n-staging.miempresa.com/webhook/sarval",
  "events": ["trip_extra_added"],
  "enabled": false
}
```

**Respuesta 200:** objeto webhook actualizado.

**curl:**
```bash
curl -X PUT http://localhost:4000/api/webhooks/1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}'
```

---

### `DELETE /api/webhooks/:id`

Elimina un webhook.

**Respuesta:** `204 No Content`

**curl:**
```bash
curl -X DELETE http://localhost:4000/api/webhooks/1 \
  -H "Authorization: Bearer <token>"
```

---

## Flujo típico del bot (n8n)

```
1. POST /api/auth/login          → obtener token
2. POST /api/trips/extra          → añadir viaje extra (o)
   PUT  /api/trips/:id            → anotar retraso / cambio de tonelaje
3. POST /api/planning/recalculate → ejecutar simulación
4. GET  /api/planning/sequence    → leer resultados (viajes con retraso)
5. n8n procesa los retrasos y notifica a camioneros por Telegram/WhatsApp
```

---

## Errores comunes

| Código | Significado |
|---|---|
| `400` | Petición incorrecta (faltan campos obligatorios o datos inválidos) |
| `401` | Credenciales incorrectas (en login) |
| `403` | Token inválido o expirado |
| `404` | Recurso no encontrado |
| `500` | Error interno del servidor |

Todas las respuestas de error tienen la forma:
```json
{ "error": "Descripción del error" }
```
