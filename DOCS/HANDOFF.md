# SARVAL — Handoff / Estado del proyecto

> Documento para retomar el trabajo en una sesión nueva sin perder contexto.
> Última actualización: **2 jun 2026** (sesión 29 may – 2 jun: duplicados, ventana de consumo, Domingo, runner de migraciones).

## 0. ⚠️ LO PRIMERO AL RETOMAR

- **Todo pusheado a `origin/main`** (último commit de funcionalidad **`1d9b802`**; este handoff va en un commit de docs aparte).
- **`backend/.env` apunta a la BBDD de PRODUCCIÓN** → todo lo que se prueba en local toca prod.
  El esquema de prod está al día.
- **Runner de migraciones automático (NUEVO)**: al arrancar el backend, `runMigrations()`
  (`backend/src/db/migrate.js`) aplica las migraciones `.sql` pendientes y las registra en la tabla
  `_migrations`; las ya aplicadas se saltan. **Para añadir una migración: crear el `.sql` y añadir su
  nombre al final del array `MIGRATIONS` en `migrate.js`.** Ya NO hace falta aplicar SQL a mano.
- **Servidores de desarrollo**: arrancar con `cd backend && npm run dev` (4000) y `cd frontend && npm run dev` (3000).

Resumen de lo hecho en la sesión 29 may – 2 jun (detalle en §4):
1. **Planes duplicados** arreglados (semana 10 salía "vacía") + **`UNIQUE(week_start)` + creación idempotente** para que no se repita.
2. **Bug del motor**: viajes fuera de ventana atascaban la cola → no se colocaba ninguno. Corregido.
3. **Semana de 7 días**: timeline **Lunes 00:00 → Domingo medianoche**; camiones todo el finde.
4. **Ventana de consumo configurable** (inicio Lunes / fin Sábado, en Tolvas) + **nivel inicial por semana**; ampliar el finde = poner una franja.
5. **Dashboard**: gráfico más ancho (1700px), **ficha de detalle al hacer clic** en un punto, tooltips reposicionados, **proveedor en el tooltip**; auto-refresh al cambiar tolva.
6. **Swagger** accesible desde Configuración › API e integraciones (botón a pestaña nueva).
7. **Runner de migraciones** (`_migrations`) → resuelve de raíz el caso "faltaba la tabla `webhooks`".
8. **`DOCS/PROPUESTA_SIMULACION.md`**: diseño del "modo simulación" para una v2 → **IMPLEMENTADO en julio 2026** (ver §Modo simulación de `DOCS/API.md`; cambio OpenSpec `modo-simulacion`).

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

### Planes en BBDD (tras la limpieza de duplicados; cambian cada semana por el rollover)
Tras limpiar 56 planes duplicados vacíos quedan **6** (1 por semana). A 2 jun 2026:
- **VIGENTE**: semana 23 (lunes 2026-06-01), plan 61, 56 viajes. *(Era la "próxima"; pasó a vigente sola el 1-jun.)*
- **PRÓXIMA (draft)**: semana 24 (lunes 2026-06-08), plan 115 (creado solo por `/weeks`).
- **Archivados**: semana 22 (plan 59, 50 viajes demo), semana 20 (plan 52, parada+box sin viajes), semana 11 (plan 34, 77 viajes), semana 10 (plan 28, 79 viajes reales del cliente).

> ⚠️ **Rollover automático**: cada lunes, `getActivePlanId()` archiva el plan de la semana que
> acaba y activa el de la nueva (vía `ON CONFLICT DO UPDATE`). Por eso el plan vigente cambia solo.
> La demo (`seed-demo-week22.js`) ya quedó atrás; si hace falta una demo en la semana en curso,
> re-seedear o crear datos en el plan vigente.

## 3. Estado del repositorio
- **Todo en `origin/main`.** Último commit de funcionalidad: **`1d9b802`** (2 jun 2026); este handoff en commit de docs posterior.
- **BBDD de producción al día**: el runner de migraciones aplica todo al arrancar (tabla `_migrations`).
- **Usuario `testuser` ya creado** en BBDD de prod. No hace falta recrearlo.

### Commits de la sesión (29 may – 2 jun), todos en `main`
`7849c68` ventana consumo + Domingo + anti-duplicados · `afd88fa` proveedor en tooltip ·
`e83ae4e` gráfico ancho + ficha detalle + tooltip abajo · `aed3957` tooltip nivel a altura del punto ·
`235d073` Swagger en Configuración · `1d9b802` runner de migraciones.

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

### 4.10 Runner de migraciones (NUEVO — 2 jun) ⭐
- `backend/src/db/migrate.js` → `runMigrations()` se ejecuta al arrancar (`server.js`, antes de `listen`).
- Aplica las `.sql` del array `MIGRATIONS` (en orden) que no consten en la tabla **`_migrations`**, y
  las registra. Las ya aplicadas se saltan. Si una falla, logea y NO tumba el arranque.
- Todas las migraciones son **idempotentes** (incluidos los `ADD CONSTRAINT`, guardados con `DO`/`pg_constraint`).
- **Excluye seeds** (`seed-*.sql`). **No crea las tablas base** (`weekly_plans`, `trips`, `sequence_results`,
  `silo_simulation`, `users`, `parameters`) — se asumen existentes (se crearon a mano en su día). Para
  un arranque-desde-cero real haría falta un `schema-base.sql` al principio del array (PENDIENTE, ver §7).
- **Añadir migración futura**: crear el `.sql` en `backend/src/db/` y añadir su nombre al final de `MIGRATIONS`.
- Resolvió de raíz el caso "faltaba la tabla `webhooks`" (estaba en `schema-config.sql`, nunca aplicada).

## 5. ⚠️ Pendiente al desplegar a producción (Dokploy)
Cambiar en variables de entorno del backend:
```
SUPERADMIN_USER=<distinto a "adminsarval">
SUPERADMIN_PASSWORD=<larga, aleatoria>
JWT_SECRET=<otra cadena larga aleatoria>
```
Opcional: `OPENAPI_PUBLIC=false` para esconder Swagger tras login.
El plan vigente cambia solo cada lunes (rollover, §2). Para la operativa real, cargar los datos en el plan vigente de la semana en curso.

## 6. Decisiones PENDIENTES del cliente
Ver `DOCS/PROPUESTA_MOTOR_SECUENCIACION.md` (Bloques A, B, C):
- **A.1** Duración de descarga. **A.2 confirmado: 1 boca/tolva.** A.3 tiempo muerto entre camiones. A.4 boxes ¿comparten boca? A.5 confirmado: salto instantáneo. A.6 resolución temporal.
- **B** Reglas: ¿peor parar planta o retrasar crítico?, nivel mínimo de seguridad, ventana de protección de críticos, orden entre críticos.
- **C** Boxes flexibles (modo lineal/flexible, tasa máx por box).

## 7. Próximos pasos sugeridos / pendientes abiertos
1. **Spec OpenAPI desactualizada** (`backend/src/docs/openapi.js` + `DOCS/API.openapi.json`): no incluye
   `/api/plan-tolva-settings`, los campos `hora_inicio_consumo`/`hora_fin_consumo`, ni el modelo nuevo
   (semana 7 días, ventana de consumo). El texto interno aún dice "Lunes 06:00 → Sábado 22:00". Actualizar.
2. **`schema-base.sql` para arranque desde cero**: el runner NO crea las tablas base (§4.10). Si se levanta
   una BBDD nueva, falta crear `weekly_plans`, `trips`, `sequence_results`, `silo_simulation`, `users`,
   `parameters`. Conviene volcar su esquema a un `schema-base.sql` y ponerlo primero en `MIGRATIONS`.
3. **Reunión cliente** → respuestas Bloques A/B/C y ajustar el motor.
4. Modelar **duración de descarga + 1 boca/tolva** (cola física), probablemente bajando el paso.
5. **Webhooks por evento** y **endpoints del bot** (n8n/Telegram), usando `trigger` + `newly_delayed`.
6. Endurecer en backend el bloqueo de "no editar el pasado" en productividad (hoy es UI).
7. ~~**Modo simulación** para supervisores~~ → **HECHO (julio 2026)**: plan clon `status='simulation'`,
   endpoints `/api/planning/simulation` (POST, `/mine`, `/:id/diff`, `/:id/apply`, DELETE), aura+cartel
   en frontend, webhooks silenciados en clones, janitor de huérfanos. Ver `DOCS/PROPUESTA_SIMULACION.md`
   (diseño) y `DOCS/API.md` §Modo simulación. Pendiente de la v2.2: simular config global de tolva.

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

## 10. Mapa de archivos clave tocados en la sesión (ya commiteados, ver §3)
**Backend:**
- `src/engine/simulator.js` — 7 días/Domingo, ventana de consumo, franja activa consumo, fix deadlock cola, respeta nivel 0.
- `src/services/recalc.js` — pasa `hora_inicio/fin_consumo` y nivel inicial efectivo (override ?? tolva).
- `src/db/helpers.js` — `getActivePlanId` idempotente (`ON CONFLICT`); `DAY_ORDER_SQL` con Domingo.
- `src/db/migrate.js` — **NUEVO** runner de migraciones (§4.10).
- `src/routes/planning.js` — `/weeks` elige plan con más viajes; próxima idempotente.
- `src/routes/tolvas.js` — `hora_inicio_consumo` + `hora_fin_consumo`.
- `src/routes/dashboard.js` — `DAY_ORDER` con Domingo.
- `src/routes/planTolvaSettings.js` — **NUEVO** (override de nivel inicial por semana/tolva).
- `src/server.js` — monta `/api/plan-tolva-settings`; ejecuta `runMigrations()` al arrancar.
- `src/db/migrate-unique-week.sql`, `migrate-consumo-inicio.sql`, `migrate-consumo-fin.sql` — **NUEVAS** migraciones.
- `src/db/migrate-tolvas.sql` — `ADD CONSTRAINT` ahora idempotentes (para el runner).
- `src/db/schema-config.sql` — ya existía; ahora aplicada por el runner (creó `webhooks`).
- `scripts/cleanup-empty-plans.js` — **NUEVO** (borra planes vacíos; ya ejecutado).

**Frontend:**
- `src/pages/Tolvas.jsx` — columnas Inicio/Fin consumo + iconos ⓘ; refresca `TolvaContext` y emite `sarval:tolva-updated`.
- `src/pages/Productividad.jsx` — calendario 7 días, recolor por ventana, panel "Nivel inicial de esta semana", franjas libres.
- `src/pages/Dashboard.jsx` + `Dashboard.module.css` — Domingo; ancho 1700px; ficha de detalle al clic; tooltips reposicionados; proveedor en tooltip; auto-refresh por `sarval:tolva-updated`.
- `src/pages/Configuracion.jsx` — botón "Abrir Swagger UI" + enlace al spec.

**Docs:**
- `DOCS/PROPUESTA_SIMULACION.md` — **NUEVO** (diseño del modo simulación para v2).
- `DOCS/HANDOFF.md` — este documento.

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
- `DOCS/PROPUESTA_SIMULACION.md` — diseño del modo simulación (implementado en julio 2026).
- `backend/src/services/simulationPlans.js` — ciclo de vida de los clones de simulación (lista única `DATA_TABLES`).
- `backend/src/routes/simulation.js` — API del modo simulación.
- `frontend/src/components/SimulationBanner.jsx` — aura, cartel, retomar y modal de diff.
- `DOCS/CASOS_DE_PRUEBA.md` — checklist QA.
- `frontend/src/context/` — `PlanContext` (plan activo), `TolvaContext` (tolvas), `BrandingContext` (demo).
