# SARVAL — Documentación de la API

> **Referencia interactiva**: `GET /api/docs` (Swagger UI) · spec cruda OpenAPI 3.0 en `GET /api/docs.json` (importable directamente en n8n, Postman, Insomnia). Este documento mantiene la guía con flujos y ejemplos en prosa; usa Swagger para probar los endpoints en vivo.

**Base URL local:** `http://localhost:4000`  
**Formato:** JSON (excepto el endpoint de subida de archivos, que usa `multipart/form-data`)  
**Autenticación:** JWT Bearer token en todas las rutas excepto `POST /api/auth/login`

> **Para LLMs / generadores de clientes**: la spec OpenAPI estática vive en `DOCS/API.openapi.json` (commiteada en el repo) y también se sirve en `GET /api/docs.json` cuando el backend está levantado.

---

## Cómo funciona el motor (lectura obligatoria)

- Una semana = un **plan** (`plan_id`). Cada plan contiene los viajes, las paradas, las lecturas, las franjas de productividad, etc. Casi todos los endpoints aceptan `?plan_id=<id>`; si se omite, se usa el **plan vigente** (el de la semana actual).
- Hay **múltiples tolvas (silos)** en paralelo. Cada tolva tiene su propia capacidad, consumo base, nivel inicial y resolución temporal (`paso_minutos`, típicamente 15 o 30). Los viajes y entradas pertenecen a una tolva.
- La **semana operativa** va de Lunes 06:00 a Sábado 22:00. El consumo es continuo (también de noche).
- **Recálculo automático**: cualquier acción mutadora (subir Excel, crear/editar/borrar viaje, parada, box, lectura de nivel, franja de productividad o cambiar parámetros de la tolva que afectan a la simulación) ejecuta el motor por debajo y regenera `sequence_results` y `silo_simulation`. **No hace falta llamar a `/recalculate` a mano** salvo que se quiera forzar la emisión de webhooks.
- El único recálculo manual con notificación de webhooks es `POST /api/planning/recalculate` (botón "Actualizar" de la UI).

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
| Planificación | GET | `/api/planning/weeks` |
| Planificación | POST | `/api/planning/upload` |
| Planificación | GET | `/api/planning/sequence` |
| Planificación | GET | `/api/planning/simulation` |
| Planificación | POST | `/api/planning/recalculate` |
| Modo simulación | POST | `/api/planning/simulation` |
| Modo simulación | GET | `/api/planning/simulation/mine` |
| Modo simulación | GET | `/api/planning/simulation/:id/diff` |
| Modo simulación | POST | `/api/planning/simulation/:id/apply` |
| Modo simulación | DELETE | `/api/planning/simulation/:id` |
| Viajes | GET | `/api/trips` |
| Viajes | GET | `/api/trips/:id` |
| Viajes | POST | `/api/trips/extra` |
| Viajes | PUT | `/api/trips/:id` |
| Viajes | DELETE | `/api/trips/:id` |
| Viajes | POST | `/api/trips/:id/divert` |
| Tolvas | GET | `/api/tolvas` |
| Tolvas | GET | `/api/tolvas/:id` |
| Tolvas | POST | `/api/tolvas` |
| Tolvas | PUT | `/api/tolvas/:id` |
| Tolvas | DELETE | `/api/tolvas/:id` |
| Paradas | GET, POST | `/api/stoppages` |
| Paradas | PUT, DELETE | `/api/stoppages/:id` |
| Boxes | GET, POST | `/api/box-entries` |
| Boxes | PUT, DELETE | `/api/box-entries/:id` |
| Lecturas nivel | GET, POST | `/api/level-readings` |
| Lecturas nivel | DELETE | `/api/level-readings/:id` |
| Productividad | GET, POST | `/api/productivity-periods` |
| Productividad | PUT, DELETE | `/api/productivity-periods/:id` |
| Dashboard | GET | `/api/dashboard` |
| Dashboard | GET | `/api/dashboard/silo-chart` |
| Proveedores | GET, POST | `/api/proveedores` |
| Proveedores | PUT, DELETE | `/api/proveedores/:id` |
| Choferes Telegram | GET, POST | `/api/telegram-drivers` |
| Choferes Telegram | PUT, DELETE | `/api/telegram-drivers/:id` |
| Personal planta | GET, POST | `/api/personal-planta` |
| Personal planta | PUT, DELETE | `/api/personal-planta/:id` |
| Parámetros (legado) | GET, PUT | `/api/parameters` |
| Configuración | GET, PUT | `/api/settings` |
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
  "email": "<usuario>",
  "password": "<contraseña>"
}
```

**Respuesta 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "email": "<usuario>",
    "role": "superadmin"
  }
}
```

**Errores:**
- `400` — email o contraseña vacíos
- `401` — credenciales incorrectas

> Las credenciales reales viven en variables de entorno (`SUPERADMIN_USER`, `SUPERADMIN_PASSWORD`) o en la tabla `users`. **Nunca** las pegues en este documento ni en commits.

**curl:**
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<usuario>","password":"<contraseña>"}'
```

---

## Parámetros del silo (legado)

> ⚠️ **Legado.** Hoy la configuración del silo vive por tolva en `/api/tolvas/:id` (`capacidad_tn`, `consumo_tn_h`, `nivel_inicial_tn`, `paso_minutos`, etc.). Este endpoint sobrevive por compatibilidad con la UI antigua, pero **no afecta al motor multi-tolva**. Para integraciones nuevas, usa Tolvas.

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
- `tolva_id=1` — filtra por tolva
- `plan_id=28` — plan concreto (si no, plan vigente)

**Respuesta 200:**
```json
[
  {
    "id": 1,
    "plan_id": 28,
    "trip_number": "5678ABC",
    "day": "Lunes",
    "scheduled_time": "07:00",
    "supplier": "PROVEEDOR A",
    "producto": "TRIGO",
    "tons": 22.5,
    "is_critical": false,
    "is_extra": false,
    "delay_h": null,
    "new_time": null,
    "status": "pending",
    "tolva_id": 1,
    "tolva_numero": 1,
    "tolva_nombre": "Tolva 1"
  }
]
```

> Desde la versión multi-tolva, `trip_number` es **VARCHAR** (matrícula del camión) y es único dentro del plan.

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

Añade un viaje extra al plan activo. La matrícula (`trip_number`) la pone el usuario y debe ser **única dentro del plan**. Recalcula el plan automáticamente. Dispara el webhook `trip_extra_added`.

**Body (todos obligatorios):**
```json
{
  "trip_number": "9999XYZ",
  "day": "Martes",
  "scheduled_time": "10:30",
  "supplier": "PROVEEDOR B",
  "producto": "MAÍZ",
  "tons": 18.0,
  "is_critical": false,
  "tolva_id": 1
}
```

**Respuesta 201:** objeto viaje creado (mismo formato que `GET /api/trips`).

**Errores:**
- `400` — faltan campos obligatorios
- `409` — ya existe un viaje con esa matrícula en la semana

**curl:**
```bash
curl -X POST http://localhost:4000/api/trips/extra \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"trip_number":"9999XYZ","day":"Martes","scheduled_time":"10:30","supplier":"PROVEEDOR B","producto":"MAÍZ","tons":18,"is_critical":false,"tolva_id":1}'
```

---

### `PUT /api/trips/:id`

Actualiza campos de un viaje existente. Solo se modifican los campos enviados. Útil para anotar retrasos, cambios de tonelaje, nueva hora, cambiar de tolva, etc. **Recalcula el plan automáticamente.** Dispara el webhook `trip_updated`.

**Body (todos opcionales):**
```json
{
  "day": "Miércoles",
  "scheduled_time": "09:00",
  "supplier": "PROVEEDOR C",
  "producto": "TRIGO",
  "tons": 20.0,
  "is_critical": true,
  "delay_h": 1.5,
  "new_time": "10:30",
  "status": "delayed",
  "tolva_id": 2
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

## Modo simulación

Sandbox para probar cambios sin tocar el plan real. Al entrar, el backend **clona el plan** (vigente o próxima) en un plan aislado con `status = 'simulation'`; todos los endpoints normales funcionan sobre el clon pasándole su `plan_id`. Los recálculos del clon **nunca emiten webhooks ni alertas** (n8n/Telegram no ven nada); solo el "Aplicar" final notifica, sobre el plan real.

Reglas: máximo **una simulación abierta por usuario**; solo puede operarla su propietario (o un superadmin); los clones son invisibles para `/weeks`, para la resolución del plan activo y para el bot; un janitor borra los clones con más de 24 h.

### `POST /api/planning/simulation`

Entra en modo simulación. Body opcional `{ "plan_id": 59 }` (por defecto, el plan activo). Solo semana vigente o próxima.

**Respuesta 201:**
```json
{ "simulation_plan_id": 105, "parent_plan_id": 59 }
```

**Respuesta 409** si el usuario ya tiene una simulación abierta (incluye su `simulation_plan_id` para retomarla).

### `GET /api/planning/simulation/mine`

Simulación abierta del usuario actual, o `null`. Permite retomarla tras recargar la página.

**Respuesta 200:**
```json
{ "simulation_plan_id": 105, "parent_plan_id": 59, "week_start": "2026-07-13", "created_at": "2026-07-15T09:30:00Z" }
```

### `GET /api/planning/simulation/:id/diff`

Resumen de cambios del clon respecto al plan real: altas/bajas/modificados por tabla, KPIs comparados y `base_changed` (el plan real cambió desde el clonado — p. ej. por el bot).

**Respuesta 200:**
```json
{
  "simulation_plan_id": 105,
  "parent_plan_id": 59,
  "tables": [
    { "tabla": "trips", "etiqueta": "Viajes", "altas": 1, "bajas": 0, "modificados": 2 },
    { "tabla": "stoppages", "etiqueta": "Paradas", "altas": 1, "bajas": 0, "modificados": 0 }
  ],
  "hay_cambios": true,
  "kpis": {
    "real": { "viajes_con_retraso": 2, "horas_paradas": 1.5, "stock_minimo": 4.2 },
    "simulacion": { "viajes_con_retraso": 3, "horas_paradas": 5.5, "stock_minimo": 0 }
  },
  "base_changed": false
}
```

### `POST /api/planning/simulation/:id/apply`

Aplica la simulación: en una transacción, los datos del clon sobrescriben al plan real (**el `id` del plan real no cambia**: las referencias de n8n siguen valiendo) y el clon se borra. Después recalcula el plan real con `notify: true` (ahora sí se emiten webhooks/alertas por los cambios ya reales). Devuelve el diff aplicado y el resultado del recálculo.

### `DELETE /api/planning/simulation/:id`

Cancela la simulación: borra el clon y todos sus datos. El plan real queda intacto.

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

### `POST /api/trips/:id/divert`

Desvía un viaje a otra tolva. Recalcula ambas tolvas (la origen y la destino). Dispara el webhook `trip_diverted`.

**Body:**
```json
{ "tolva_id": 2 }
```

**Respuesta 200:**
```json
{
  "message": "Viaje desviado y recalculado",
  "trip_id": 25,
  "from_tolva_id": 1,
  "to_tolva_id": 2
}
```

**Errores:**
- `400` — el viaje ya está en esa tolva, o la tolva destino no existe / está inactiva
- `404` — viaje no encontrado

---

### `GET /api/planning/weeks`

Devuelve la semana **vigente**, la **próxima** (la crea en estado `draft` si no existe) y un histórico (`pasadas[]`).

**Respuesta 200:**
```json
{
  "vigente": {
    "id": 28,
    "week_start": "2026-03-02",
    "week_end": "2026-03-08",
    "week_number": 10,
    "week_label": "Semana 10 · Lunes 2 mar – Domingo 8 mar 2026",
    "type": "vigente"
  },
  "proxima": { "...": "...", "type": "proxima" },
  "pasadas": [{ "...": "...", "type": "pasada" }]
}
```

---

## Tolvas (silos)

Cada tolva es un silo con su capacidad, consumo base, nivel inicial y resolución temporal (`paso_minutos`, típicamente 15 o 30). Los viajes, paradas, boxes, lecturas y franjas pertenecen a una tolva concreta.

### `GET /api/tolvas`

Lista tolvas activas. Con `?todas=true` incluye las inactivas.

**Respuesta 200:**
```json
[
  {
    "id": 1,
    "numero": 1,
    "nombre": "Tolva 1",
    "capacidad_tn": 40,
    "consumo_tn_h": 12,
    "nivel_inicial_tn": 20,
    "paso_minutos": 30,
    "nivel_minimo_alerta_tn": 5,
    "max_espera_critico_h": 2,
    "activa": true,
    "created_at": "2026-02-01T10:00:00Z"
  }
]
```

### `GET /api/tolvas/:id`, `POST /api/tolvas`, `PUT /api/tolvas/:id`, `DELETE /api/tolvas/:id`

CRUD estándar. **El POST exige `numero`** (único). **El DELETE es soft** (marca `activa: false`) para no romper FKs en `trips`. El **PUT recalcula el plan vigente** si se modifica `capacidad_tn`, `consumo_tn_h`, `nivel_inicial_tn`, `paso_minutos` o `activa`.

**Body del POST (mínimo `numero`):**
```json
{
  "numero": 3,
  "nombre": "Tolva 3",
  "capacidad_tn": 40,
  "consumo_tn_h": 12,
  "nivel_inicial_tn": 20,
  "paso_minutos": 30,
  "nivel_minimo_alerta_tn": 5,
  "max_espera_critico_h": 2
}
```

---

## Paradas

Las paradas pausan **toda** la actividad de una tolva (consumo, camiones y boxes) entre `hora_inicio` y `hora_fin` del día indicado.

### `GET /api/stoppages`

Lista paradas del plan activo. Soporta `?plan_id=` y `?tolva_id=`.

### `POST /api/stoppages`

Crea parada y recalcula.

**Body:**
```json
{
  "tolva_id": 1,
  "tipo": "mantenimiento",
  "descripcion": "Cambio de filtros",
  "dia": "Martes",
  "hora_inicio": "08:00",
  "hora_fin": "10:00"
}
```

Campos obligatorios: `tolva_id`, `dia`, `hora_inicio`, `hora_fin`.

### `PUT /api/stoppages/:id`, `DELETE /api/stoppages/:id`

Actualizar y borrar. Recalculan automáticamente.

---

## Boxes (entradas no-camión)

Entradas de material que no son un camión: trasvases, recirculaciones, etc. Se reparten linealmente a lo largo de `periodo_horas` desde `hora_inicio`. Las paradas las posponen (no gotean durante una parada; entregan el total al reanudar).

### `GET /api/box-entries`

Lista. Soporta `?plan_id=` y `?tolva_id=`.

### `POST /api/box-entries`

```json
{
  "tolva_id": 1,
  "num_boxes": 4,
  "total_tons": 24,
  "periodo_horas": 8,
  "dia": "Lunes",
  "hora_inicio": "08:00",
  "descripcion": "Box norte"
}
```

Campos obligatorios: `tolva_id`, `dia`, `total_tons`. Defaults: `num_boxes=1`, `periodo_horas=24`, `hora_inicio="06:00"`.

### `PUT /api/box-entries/:id`, `DELETE /api/box-entries/:id`

Actualizar y borrar. Recalculan automáticamente.

---

## Lecturas de nivel

Lecturas manuales del nivel real del silo (no hay células de pesada). **Reanclan la simulación**: en el paso de la lectura, el nivel real sustituye al estimado y el motor recalcula hacia adelante. El pasado no se toca.

### `GET /api/level-readings`

Lista. Soporta `?plan_id=` y `?tolva_id=`.

### `POST /api/level-readings`

```json
{
  "tolva_id": 1,
  "dia": "Martes",
  "hora": "11:00",
  "nivel_tn": 18.5,
  "nota": "Lectura visual operario A"
}
```

Campos obligatorios: `tolva_id`, `dia`, `hora`, `nivel_tn`. Recalcula automáticamente.

### `DELETE /api/level-readings/:id`

Borrar. Recalcula automáticamente.

---

## Productividad (consumo variable por franjas)

Franjas que **sustituyen el `consumo_tn_h` base** de la tolva en su tramo. En solapamientos, **gana la franja con `id` mayor** (= la más reciente). Permite modelar turnos con productividades distintas, ralentizaciones, picos, etc.

> El pasado no se puede editar (UI lo bloquea; endurecer en backend pendiente). En su tramo, la franja pisa el consumo base.

### `GET /api/productivity-periods`

Lista. Soporta `?plan_id=` y `?tolva_id=`.

### `POST /api/productivity-periods`

```json
{
  "tolva_id": 1,
  "dia": "Lunes",
  "hora_inicio": "14:00",
  "hora_fin": "18:00",
  "consumo_tn_h": 10
}
```

Todos obligatorios. `hora_fin` debe ser estrictamente posterior a `hora_inicio`. Recalcula automáticamente.

### `PUT /api/productivity-periods/:id`, `DELETE /api/productivity-periods/:id`

Actualizar y borrar. Recalculan automáticamente.

---

## Proveedores

Catálogo de proveedores (CRUD estándar; DELETE es soft).

- `GET /api/proveedores` — `?activo=true|false` opcional.
- `POST /api/proveedores` — `{ "nombre": "...", "activo": true }` (nombre obligatorio).
- `PUT /api/proveedores/:id` — `{ "nombre", "activo" }` (ambos opcionales).
- `DELETE /api/proveedores/:id` — marca `activo: false`.

---

## Choferes de Telegram

Vincula `telegram_id` a un nombre de chofer (para el bot de FASE 2).

- `GET /api/telegram-drivers`
- `POST /api/telegram-drivers` — `{ "telegram_id": "123456789", "nombre_chofer": "Juan Pérez", "telefono": "+34..." }`. `telegram_id` es BIGINT (string en JSON).
- `PUT /api/telegram-drivers/:id` — `{ "nombre_chofer", "telefono" }`.
- `DELETE /api/telegram-drivers/:id`.

Error `409` si se duplica `telegram_id`.

---

## Personal de planta

Personal interno y sus canales preferidos para recibir alertas.

- `GET /api/personal-planta` — `?todos=true` para incluir inactivos.
- `POST /api/personal-planta` — `{ "nombre" (obligatorio), "rol", "telefono", "email", "canal_preferido": "whatsapp|telegram|email|sms", "recibir_alertas": true }`.
- `PUT /api/personal-planta/:id` — todos opcionales.
- `DELETE /api/personal-planta/:id` — hard delete.

---

## Flujo típico del bot (n8n)

```
1. POST /api/auth/login           → obtener token (renovar cada 7 días)
2. POST /api/trips/extra          → añadir viaje extra, o
   PUT  /api/trips/:id            → anotar retraso / cambio de tonelaje, o
   POST /api/level-readings       → registrar lectura real del silo, etc.
   (cualquier acción mutadora recalcula sola: NO hace falta /recalculate)
3. GET  /api/planning/sequence    → leer resultados (viajes con retraso)
4. n8n procesa los retrasos y notifica a camioneros por Telegram/WhatsApp
```

> Si quieres que la acción emita los webhooks configurados, llama a `POST /api/planning/recalculate` después. Es el único recálculo con `notify: true`.

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
