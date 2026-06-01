# SARVAL — Handoff / Estado del proyecto

> Documento para retomar el trabajo en una sesión nueva sin perder contexto.
> Última actualización: **31 may 2026** (sesión 29–31 may: duplicados, ventana de consumo, Domingo).

## 0. ⚠️ LO PRIMERO AL RETOMAR (estado de la sesión 29–31 may)

- **Hay cambios SIN COMMITEAR** en el working tree. El último commit sigue siendo `531fbf3`.
  Todo lo de esta sesión está en local **pero la BBDD de producción YA está migrada y con datos
  recalculados** (porque `backend/.env` apunta a prod). Es decir: el **código** falta por
  commitear/pushear; los **datos y el esquema** ya viven en prod.
- **Migraciones nuevas YA aplicadas en prod** (no reaplicar a ciegas; todas son idempotentes):
  `migrate-unique-week.sql`, `migrate-consumo-inicio.sql`, `migrate-consumo-fin.sql`.
- **Al desplegar el código nuevo**: el esquema ya está; solo viaja el código. Si se desplegara
  contra una BBDD limpia, las 3 migraciones se ejecutan en orden y son seguras.
- Cuando el usuario dé el OK → **commitear en lote** (ver §10 lista de archivos tocados).

Resumen de lo hecho esta sesión (detalle en §4):
1. **Arreglados los planes duplicados** (semana 10 "vacía") + **candado para que no vuelva a pasar**.
2. **Bug del motor**: viajes fuera de ventana atascaban la cola → ningún viaje se colocaba. Corregido.
3. **Ventana de consumo configurable** (inicio Lunes / fin Sábado) + **timeline ampliado a Domingo medianoche**.
4. **Nivel inicial por semana** y **inicio de consumo** visibles/editables; consumo continuo o ampliable con franjas el finde.
5. **Auto-refresh** del Dashboard al cambiar parámetros de tolva.
6. **`DOCS/PROPUESTA_SIMULACION.md`**: diseño del "modo simulación" para una v2 (no implementado).

## 1. Qué es SARVAL
App web para planificar las **descargas de camiones en silos (tolvas)** de una planta. Sustituye un Excel + script. Simula el nivel del silo a lo largo de la semana, decide cuándo descarga cada camión (prioridad a los **críticos**), y avisa de retrasos y paradas. Preparada para integrarse con un **bot de n8n/Telegram** (FASE 2, aún no conectado).

- **Ventana de la semana (recepción de camiones + curva)**: **Lunes 00:00 → Domingo medianoche** (7 días). Los camiones pueden llegar a cualquier hora de la semana.
- **Ventana de consumo**: del **Lunes `hora_inicio_consumo`** (def 06:00) al **Sábado `hora_fin_consumo`** (def 22:00), continua incluidas las noches. Editable por tolva en la vista Tolvas. Fuera de esa ventana **no hay consumo base**, salvo que una **franja de productividad** cubra el tramo (una franja activa el consumo a su caudal en cualquier día/hora → así se "amplía" el finde).
- **Backend**: Node + Express + PostgreSQL. `backend/src`.
- **Frontend**: React + Vite + Recharts. `frontend/src`.
- **Motor**: `backend/src/engine/simulator.js` (función `run`).
- **Despliegue**: Docker Compose / Dokploy desde GitHub (rama `main`).

## 2. Cómo arrancar en local
Dos terminales:
```
cd backend && npm run dev      # http://localhost:4000 (node --watch)
cd frontend && npm run dev     # http://localhost:3000 (Vite HMR)
```
El `backend/.env` apunta a la **MISMA BBDD de producción** (`91.99.128.20:5400/sarval`). Todos los datos son de prueba.

### Usuarios de login disponibles
- `adminsarval` / `adminsarval123` (superadmin via `.env`, hardcodeado).
- `testuser` / `testuser123` (en tabla `users`, rol `superadmin`).

### Planes en BBDD ahora mismo (tras la limpieza de duplicados)
Quedan **5 planes** (antes había 61, la mayoría duplicados vacíos — ver §4.1):
- **Plan 59 = VIGENTE**: semana 22 (lunes 2026-05-25), 50 viajes ficticios para demos. `seed-demo-week22.js`.
- **Plan 61 = PRÓXIMA (draft)**: semana 23 (lunes 2026-06-01), 56 viajes.
- **Plan 28 = archivado**: semana 10 (lunes 2026-03-02), 79 viajes reales del cliente.
- **Plan 34 = archivado**: semana 11 (lunes 2026-03-09), 77 viajes.
- **Plan 52 = archivado**: semana 20 (lunes 2026-05-11), sin viajes (una parada + un box sueltos).

> ⚠️ **Rollover de semana**: a partir del **lunes 2026-06-01**, `getActivePlanId()` archivará el
> plan 59 y activará automáticamente el plan de esa semana (el 61, hoy próxima) vía
> `ON CONFLICT DO UPDATE`. Si quieres mantener la demo de la semana 22 como vigente, habrá que
> re-seedear o reactivar el 59 manualmente.

## 3. Estado del repositorio
- **Último commit**: `531fbf3` (28 may 2026). **El trabajo de la sesión 29–31 may está SIN COMMITEAR** (ver §0 y §10).
- **BBDD de producción ya migrada** con TODAS las migraciones (incluidas las 3 nuevas de esta sesión) y todos los planes recalculados con el motor nuevo.
- **Usuario `testuser` ya creado** en BBDD de prod. No hace falta recrearlo.

## 4. Capacidades del motor y la app

### 4.1 Prevención de planes duplicados (NUEVO — sesión 29 may)
- **Causa del bug**: `getActivePlanId()` y `/weeks` hacían `INSERT` de un plan cuando no lo
  encontraban; bajo varias peticiones concurrentes (el Dashboard lanza ~5) se creaban varios
  planes para la misma semana. El selector de historial cogía el duplicado vacío (mayor id) y
  ocultaba el plan con datos → la semana 10 salía "vacía".
- **Arreglado**:
  - `/api/planning/weeks` elige por semana el plan **con más viajes** (no el id más alto).
  - **`UNIQUE (week_start)`** en `weekly_plans` (`migrate-unique-week.sql`) → la BBDD rechaza un
    segundo plan por semana.
  - Creación **idempotente** (`INSERT ... ON CONFLICT (week_start)`) en `getActivePlanId()` y `/weeks`.
  - `backend/scripts/cleanup-empty-plans.js` borró los 55 planes vacíos (idempotente, reutilizable).
- **Probado**: 15 peticiones concurrentes → 0 planes nuevos.

### 4.2 Motor (`simulator.js`)
- **Semana de 7 días** (Lunes…**Domingo**); el timeline va de Lunes 00:00 a Domingo medianoche.
- **Ventana de consumo** `[Lunes hora_inicio_consumo → Sábado hora_fin_consumo]`: dentro hay consumo
  continuo (incl. noches). **Fuera no hay consumo base**, salvo que una franja cubra el paso.
- **Una franja de productividad activa el consumo en su tramo** a su caudal, en cualquier día/hora
  (incluido el finde, fuera de la ventana base). Si no hay franja dentro de la ventana → consumo base.
- **Nivel inicial**: se respeta el `0` explícito (antes el código lo forzaba a 20). Override por
  semana vía `plan_tolva_settings`.
- **Camiones fuera de ventana**: se anclan al borde del rango (no se pierden ni atascan la cola).
  *(Bug corregido: un viaje pre-06:00 quedaba el primero de la cola ordenada y, con la comparación
  `arr === t`, atascaba el puntero → NINGÚN viaje se colocaba. Ahora se encola con `arr <= t` y se
  ancla a la ventana.)*
- **Paradas pausan TODA actividad** (consumo + descargas + boxes). **Boxes se posponen**.
- **Lecturas de nivel reanclan** la simulación.
- **Caudal variable por franjas** (`buildRateMap`): en solapamientos gana la franja de mayor id.

### 4.3 Ventana de consumo y nivel inicial (NUEVO)
- **Tolvas**: campos `hora_inicio_consumo` (etiqueta "Lun") y `hora_fin_consumo` (etiqueta "Sáb"),
  editables, con icono ⓘ. Son **globales** (igual para todas las semanas).
- **Nivel inicial por semana**: tabla `plan_tolva_settings (plan_id, tolva_id, nivel_inicial_tn)`,
  override del valor de la tolva. Editable en **Productividad** (panel "Nivel inicial de esta semana").
  Ruta `/api/plan-tolva-settings` (GET/PUT, recalcula al guardar).
- **Ampliar consumo el finde**: NO hay override de horas por semana; se hace **con una franja** en
  Productividad (más simple, una sola vía). Limitación conocida: la config de tolva es global, así que
  "simular un consumo distinto de la tolva" no es por-semana (ver `DOCS/PROPUESTA_SIMULACION.md` §6).

### 4.4 Recálculo estandarizado (clave de arquitectura)
- **Servicio único** `backend/src/services/recalc.js` → `recalcPlan(planId, { trigger, notify })`.
- **Toda acción que altera la simulación recalcula sola** (backend): upload, viaje (CRUD), desviar,
  parada (CRUD), box (CRUD), lectura (CRUD), productividad (CRUD), parámetros de tolva, nivel inicial
  por semana. El frontend solo recarga.
- El botón **"Actualizar"** es el único con `notify:true` (webhooks/alertas). Las acciones automáticas
  recalculan en silencio. Punto único para enganchar avisos por evento (FASE 2).
- **Auto-refresh (NUEVO)**: al guardar en Tolvas, el backend recalcula y el frontend emite el evento
  `sarval:tolva-updated`; el Dashboard lo escucha y recarga gráfico/KPIs. Además `TolvaContext` se
  refresca (`loadTolvas`) para que Productividad herede los valores nuevos sin recargar la página.

### 4.5 Productividad
- Vista `frontend/src/pages/Productividad.jsx`. Tabla `productivity_periods`, ruta `/api/productivity-periods` (CRUD).
- **Calendario visual de 7 días** (Domingo incluido): **verde** = franja activa; **gris** = caudal base
  dentro de la ventana de consumo; **rayado** = fuera de la ventana de consumo. Si amplías la ventana
  en Tolvas, lo rayado pasa a gris.
- **Franjas editables cualquier día/hora** (incl. Domingo y fuera de horario, sin error).
- **No toca el pasado** en semana vigente (franja ya empezada → 🔒).

### 4.6 Dashboard / gráfico
- Curva en **dientes de sierra**; eje X **Lunes 00:00 → Domingo** (7 días, filtro con Domingo).
- Camión sube nivel sin consumo antes del inicio de consumo; a partir de ahí, baja.
- Ejes Y redondeados; panel de flujos con escala fija ±capacidad; tooltip con cada viaje (matrícula + tn), críticos con **CR**.
- Multi-tolva sin selección → no muestra gráfico (pide elegir tolva).
- Lecturas de nivel manual: botón "Registrar nivel real", marcador morado, historial.

### 4.7 Secuenciación
- Edición inline (día/hora/proveedor/producto/ton/crítico/retraso/nueva hora/estado), columna Acciones sticky.
- Selector de columnas (localStorage), columna "Nivel previo (tn)", retraso con 2 decimales, críticos con chip verde.

### 4.8 Documentación API
- **Swagger UI** `GET /api/docs`; **spec** `GET /api/docs.json`; copia estática `DOCS/API.openapi.json`; prosa `DOCS/API.md`. `OPENAPI_PUBLIC=false` la cierra tras JWT.
  > ⚠️ La spec OpenAPI **no incluye aún** los endpoints/campos nuevos de esta sesión
  > (`/api/plan-tolva-settings`, `hora_inicio_consumo`, `hora_fin_consumo`). Actualizar al commitear.

### 4.9 Modo demo anonimizado
- Toggle en menú del avatar (solo `role=superadmin`). Persiste en `app_settings` (key `anonimizar`). Lectura pública `GET /api/branding`. Cambia "SARVAL" → "Planificador de descargas" en sidebar/login/title. No cambia datos.

## 5. ⚠️ Pendiente al desplegar a producción (Dokploy)
Cambiar en variables de entorno del backend:
```
SUPERADMIN_USER=<distinto a "adminsarval">
SUPERADMIN_PASSWORD=<larga, aleatoria>
JWT_SECRET=<otra cadena larga aleatoria>
```
Opcional: `OPENAPI_PUBLIC=false` para esconder Swagger tras login.
Recordar: el plan 59 (sem 22, datos ficticios) es el vigente actual. Para la operativa real del cliente, dejar como vigente el plan que toque.

## 6. Decisiones PENDIENTES del cliente
Ver `DOCS/PROPUESTA_MOTOR_SECUENCIACION.md` (Bloques A, B, C):
- **A.1** Duración de descarga. **A.2 confirmado: 1 boca/tolva.** A.3 tiempo muerto entre camiones. A.4 boxes ¿comparten boca? A.5 confirmado: salto instantáneo. A.6 resolución temporal.
- **B** Reglas: ¿peor parar planta o retrasar crítico?, nivel mínimo de seguridad, ventana de protección de críticos, orden entre críticos.
- **C** Boxes flexibles (modo lineal/flexible, tasa máx por box).

## 7. Próximos pasos sugeridos
1. **Commitear/pushear** el trabajo de la sesión 29–31 may cuando haya OK (§10).
2. Actualizar la **spec OpenAPI** (`backend/src/docs/openapi.js` + `DOCS/API.openapi.json`) con
   `/api/plan-tolva-settings` y los campos `hora_inicio_consumo`/`hora_fin_consumo`.
3. **Reunión cliente** → respuestas Bloques A/B/C y ajustar el motor.
4. Modelar **duración de descarga + 1 boca/tolva** (cola física), probablemente bajando el paso.
5. **Webhooks por evento** y **endpoints del bot** (n8n/Telegram), usando `trigger` + `newly_delayed`.
6. Endurecer en backend el bloqueo de "no editar el pasado" en productividad (hoy es UI).
7. **Modo simulación** para supervisores → ver `DOCS/PROPUESTA_SIMULACION.md` (diseño listo para v2).

### Estrategia para el bot (FASE 2)
- **n8n para todo** (no código). Llamadas a SARVAL vía **HTTP nodes** con la spec OpenAPI.
- **Postgres nodes** solo para lecturas baratas. Toda mutación vía HTTP para respetar `recalcPlan` + webhooks.
- **Regla**: lógica que ocuparía 3 nodos function en n8n → convertir en endpoint de SARVAL.

## 8. Validación
`DOCS/CASOS_DE_PRUEBA.md` — checklist de casos a testear.

## 9. Cómo trabaja el usuario (preferencias)
- **Pensar y proponer antes de actuar** en cambios de diseño/negocio.
- **Verificar end-to-end** (probar contra datos reales, revertir las pruebas).
- **Local sin pushear** hasta su OK; commitear en lote cuando lo pida.
- Comunicación en **español** (algo para el cliente en **catalán**).

## 10. Archivos tocados en la sesión 29–31 may (para el commit)
**Backend:**
- `src/engine/simulator.js` — 7 días/Domingo, ventana de consumo, franja activa consumo, fix deadlock cola, respeta nivel 0.
- `src/services/recalc.js` — pasa `hora_inicio/fin_consumo` y nivel inicial efectivo (override ?? tolva).
- `src/db/helpers.js` — `getActivePlanId` idempotente (`ON CONFLICT`); `DAY_ORDER_SQL` con Domingo.
- `src/routes/planning.js` — `/weeks` elige plan con más viajes; próxima idempotente.
- `src/routes/tolvas.js` — `hora_inicio_consumo` + `hora_fin_consumo` (GET/POST/PUT, afectan sim).
- `src/routes/dashboard.js` — `DAY_ORDER` con Domingo.
- `src/routes/planTolvaSettings.js` — **NUEVO** (override de nivel inicial por semana/tolva).
- `src/server.js` — monta `/api/plan-tolva-settings`.
- `src/db/migrate-unique-week.sql` — **NUEVO** (dedup + `UNIQUE(week_start)`). *Aplicada.*
- `src/db/migrate-consumo-inicio.sql` — **NUEVO** (`tolvas.hora_inicio_consumo` + tabla `plan_tolva_settings`). *Aplicada.*
- `src/db/migrate-consumo-fin.sql` — **NUEVO** (`tolvas.hora_fin_consumo`). *Aplicada.*
- `scripts/cleanup-empty-plans.js` — **NUEVO** (borra planes vacíos; ya ejecutado).

**Frontend:**
- `src/pages/Tolvas.jsx` — columnas Inicio/Fin consumo + iconos ⓘ; refresca `TolvaContext` y emite `sarval:tolva-updated` al guardar.
- `src/pages/Productividad.jsx` — calendario 7 días, recolor por ventana, panel "Nivel inicial de esta semana", franjas libres.
- `src/pages/Dashboard.jsx` — arrays de día con Domingo; escucha `sarval:tolva-updated` para recargar.

**Docs:**
- `DOCS/PROPUESTA_SIMULACION.md` — **NUEVO** (diseño del modo simulación para v2).
- `DOCS/HANDOFF.md` — este documento (actualizado).

## 11. Artefactos importantes del repo
- `backend/src/engine/simulator.js` — motor.
- `backend/src/services/recalc.js` — recálculo centralizado.
- `backend/src/db/helpers.js` — `getActivePlanId`, `resolvePlanId`.
- `backend/src/routes/` — endpoints REST.
- `backend/scripts/seed-demo-week22.js` — genera el plan demo idempotente.
- `backend/scripts/cleanup-empty-plans.js` — limpia planes vacíos.
- `backend/src/db/migrate-*.sql` — migraciones (todas aplicadas en prod).
- `DOCS/API.md` / `DOCS/API.openapi.json` — doc API (pendiente actualizar con lo nuevo).
- `DOCS/PROPUESTA_MOTOR_SECUENCIACION.md` — preguntas pendientes al cliente.
- `DOCS/PROPUESTA_SIMULACION.md` — diseño del modo simulación (v2).
- `DOCS/CASOS_DE_PRUEBA.md` — checklist QA.
- `frontend/src/context/` — `PlanContext` (plan activo), `TolvaContext` (tolvas), `BrandingContext` (demo).
