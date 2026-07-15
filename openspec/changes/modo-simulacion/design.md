## Context

SARVAL planifica la semana (Lunes–Domingo) en un `weekly_plans` por semana, con tablas hijas ruteadas por `plan_id`: datos de entrada (`trips`, `stoppages`, `box_entries`, `level_readings`, `productivity_periods`, `plan_tolva_settings`) y resultados regenerables (`sequence_results`, `silo_simulation`). El único punto de recálculo es `recalcPlan(planId, { trigger, notify })` (`backend/src/services/recalc.js`); toda acción mutadora lo llama con `notify:false` y solo el botón "Actualizar" notifica webhooks/alertas.

El frontend rutea TODO su tráfico por `plan_id`: `PlanContext` guarda el plan seleccionado en `window.__SARVAL_PLAN_ID` y `api()` (`frontend/src/api.js`) lo añade como query param a cada petición. El backend lo resuelve con `resolvePlanId(req)` con fallback a `getActivePlanId()`.

Restricciones vigentes que condicionan el diseño:
- `UNIQUE(week_start)` en `weekly_plans` (migración `migrate-unique-week.sql`) + dos `ON CONFLICT (week_start)` que dependen de ella (`helpers.js` `getActivePlanId`, `planning.js` `/weeks`).
- La query de "próxima" en `/weeks` elige plan por `week_start` con `ORDER BY trip_count DESC` — un clon de simulación (mismo `week_start`, viajes copiados) la contaminaría.
- La config de tolva (`tolvas`: capacidad, consumo, paso, ventana) es global, no por plan → no simulable en esta fase (§6 de `DOCS/PROPUESTA_SIMULACION.md`).
- Migraciones vía runner al arrancar (`backend/src/db/migrate.js`, tabla `_migrations`, lista ordenada `MIGRATIONS`).

Decisiones de producto ya cerradas (§14 de la propuesta): lecturas de nivel NO editables en simulación; solo se simula vigente/próxima; "Aplicar" con diff + confirmación explícita; simulación por usuario (el resultado aplicado es para todos).

## Goals / Non-Goals

**Goals:**
- Sandbox global por usuario: probar cambios en todas las áreas editables (viajes/extras, paradas, boxes, productividad, secuenciación derivada) viendo gráfico/KPIs/secuencia actualizados en vivo, sin tocar el plan real.
- Aplicar (transaccional, preservando el `id` del plan real) o cancelar, con diff previo y confirmación.
- Cero ruido externo: n8n/Telegram no ven clones ni reciben avisos por recálculos simulados.
- Señalización visual inequívoca en todas las vistas.
- Que todo lo existente siga funcionando: `/weeks`, `ON CONFLICT`, rollover de semana, upload, bot n8n.

**Non-Goals:**
- Simular cambios de config global de tolva (capacidad/consumo/paso/ventana) — requiere snapshot por plan, queda para v2.2.
- Diff visual fino campo a campo (el MVP muestra resumen por tabla + KPIs comparados).
- Simular sobre semanas archivadas.
- Multi-simulación por usuario (un clon abierto por usuario como máximo).

## Decisions

### D1 — Plan clon en BBDD (`status = 'simulation'`), no estado en frontend ni snapshot/restore
El motor vive en el backend y necesita los datos en BBDD; acumular el diff en memoria obligaría a replicar el motor en el cliente. Snapshot/restore sobre el plan real expondría datos ficticios a otros usuarios y a n8n mientras dura la simulación. El clon reutiliza el 100% del ruteo por `plan_id` existente: **ningún endpoint de datos cambia**. (Alternativas descartadas en §3 y §12 de la propuesta.)

### D2 — Índice único parcial en vez de `UNIQUE(week_start)`
El clon comparte `week_start` con su padre. Migración `migrate-simulation-mode.sql` (idempotente, al final de `MIGRATIONS`):
```sql
ALTER TABLE weekly_plans DROP CONSTRAINT IF EXISTS weekly_plans_week_start_unique;
CREATE UNIQUE INDEX IF NOT EXISTS weekly_plans_week_start_real
  ON weekly_plans (week_start) WHERE status <> 'simulation';
ALTER TABLE weekly_plans ADD COLUMN IF NOT EXISTS parent_plan_id INTEGER;
ALTER TABLE weekly_plans ADD COLUMN IF NOT EXISTS simulation_owner TEXT;
ALTER TABLE weekly_plans ADD COLUMN IF NOT EXISTS base_fingerprint TEXT;
```
**Obligatorio en el mismo cambio**: los dos `ON CONFLICT (week_start)` pasan a `ON CONFLICT (week_start) WHERE status <> 'simulation'` (predicado de índice parcial; Postgres también lo acepta contra la constraint completa, así que el orden migración/código en el arranque no importa — y de hecho el runner migra antes de servir tráfico).

- `simulation_owner` guarda el email del JWT (`req.user.email`) — es el identificador estable que ya viaja en el token.
- `base_fingerprint`: hash sha256 del contenido de las tablas hijas de datos del padre en el momento de clonar (filas ordenadas, sin `id`/`plan_id`), para detectar "el plan base cambió" al hacer diff/aplicar.

### D3 — Lista única de tablas hijas, clonado por introspección de columnas
Constante única en el nuevo servicio `backend/src/services/simulationPlans.js`:
```js
const DATA_TABLES = ['trips', 'stoppages', 'box_entries', 'level_readings',
                     'productivity_periods', 'plan_tolva_settings'];
const RESULT_TABLES = ['sequence_results', 'silo_simulation']; // no se clonan: los regenera recalcPlan
```
El INSERT…SELECT de clonado/aplicado se construye leyendo las columnas de `information_schema.columns` y excluyendo `id` y `plan_id`. Así, añadir una columna a una tabla hija no rompe ni desincroniza el clonado (elimina el riesgo de lista de columnas hardcodeada que ya sufre `cleanup-empty-plans.js`). Añadir una **tabla** hija nueva sigue requiriendo tocar solo esta constante.

### D4 — API bajo `/api/planning/simulation` como subrouter
Nuevo `backend/src/routes/simulation.js`, montado desde `planning.js` con `router.use('/simulation', simulationRouter)`. El `GET /simulation` existente (pasos del silo) se define ANTES del `use` y no colisiona (métodos/paths distintos). Endpoints (todos tras `authMiddleware`, ya aplicado al montar `/api/planning`):

| Método y ruta | Comportamiento |
|---|---|
| `POST /` | Clona el plan indicado (`plan_id` en body; por defecto el activo). Rechaza si el plan no es vigente/próxima (status debe ser `active`/`draft` y semana actual o siguiente), si ya es un clon, o si el usuario ya tiene una simulación abierta (409 con la existente). Clona hijos + `recalcPlan(clon, {notify:false})`. Devuelve `{ simulation_plan_id, parent_plan_id, week }`. |
| `GET /mine` | Simulación abierta del usuario (o `null`) — permite retomar tras un refresh y evita clones huérfanos por recarga. |
| `GET /:id/diff` | Resumen por tabla (altas/bajas/modificados comparando filas sin `id`/`plan_id`), KPIs comparados padre vs. clon (viajes con retraso, horas paradas, stock mínimo — de `sequence_results`/`silo_simulation`) y `base_changed` (fingerprint actual del padre vs. `base_fingerprint`). |
| `POST /:id/apply` | En transacción: borra hijos del padre (datos + resultados), copia los datos del clon al padre, borra el clon y sus hijos; `COMMIT`; después `recalcPlan(padre, { trigger:'simulation_apply', notify:true })`. Devuelve el resumen aplicado. |
| `DELETE /:id` | Borra el clon y todos sus hijos (datos + resultados). |

`:id` debe ser un plan `status='simulation'` propiedad del usuario (o el usuario es `superadmin`); si no, 403/404. El apply recalcula el padre FUERA de la transacción (recalc hace sus propios DELETE/INSERT); si el recalc fallara, el estado de datos ya es correcto y un "Actualizar" manual lo regenera.

### D5 — Supresión de notificaciones centralizada en `recalcPlan`
`recalcPlan` consulta el `status` del plan al inicio; si es `'simulation'`, fuerza `notify = false` aunque el llamante pida lo contrario (defensa en profundidad; ningún llamante debería pedirlo). El webhook `plan_uploaded` de `upload.js` — único `notifyWebhooks` directo fuera de recalc que puede operar sobre un clon — se guarda con la misma comprobación. `checkAlerts` solo corre bajo `notify`, queda cubierto.

### D6 — Invisibilidad de los clones para la navegación y el bot
- `getActivePlanId()`: ya filtra por `status='active'` — sin cambios (salvo el `ON CONFLICT`).
- `/weeks`: añadir `AND wp.status <> 'simulation'` a las dos queries de "próxima" (la de búsqueda con `trip_count` y la de relectura tras el INSERT). "Pasadas" ya filtra `archived`.
- n8n/bot usan los endpoints normales sin `plan_id` → resuelven al plan activo real. Nunca ven clones.

### D7 — Frontend: la simulación vive en `PlanContext`; el resto de la app no se entera
- `PlanContext` añade `simulation` (`{ id, parentId, parentLabel }` o `null`), `isSimulating`, `startSimulation()`, `applySimulation()`, `cancelSimulation()`. Al simular, `setPlanId(simulation.id)` → `window.__SARVAL_PLAN_ID` apunta al clon y **todas las páginas siguen funcionando sin cambios** (ya leen/escriben vía `api()`).
- Al montar, `GET /simulation/mine`: si hay una abierta, se ofrece retomarla o descartarla (evita huérfanos por refresh).
- Señalización en `Layout.jsx` (todas las vistas): aura `box-shadow` inset roja con animación sutil de respiración + cartel sticky "🔴 MODO SIMULACIÓN — los cambios NO son reales · Simulando sobre: Semana X [Aplicar cambios] [Cancelar]".
- `WeekSelector`: deshabilitado en simulación mostrando la semana base; debajo, botón "Simular cambios" visible solo cuando el plan actual es vigente o próxima.
- "Aplicar cambios" abre un modal con el diff (`GET /:id/diff`) + aviso si `base_changed` + botón de confirmación que ejecuta el apply. "Cancelar" pide `confirm()` simple.
- Bloqueos de edición: `Tolvas.jsx` deshabilita edición con nota "No editable en simulación (configuración global)"; `Dashboard.jsx` oculta alta/borrado de lecturas de nivel con nota equivalente.

### D8 — Janitor de clones huérfanos
Función `cleanupStaleSimulations(maxAgeHours = 24)` en `simulationPlans.js`: borra planes `simulation` con `created_at` anterior al umbral (con sus hijos). Se ejecuta al arrancar el server y cada 6 h con `setInterval` (patrón mínimo, sin dependencia nueva). `/mine` reduce la aparición de huérfanos; el janitor es la red de seguridad.

## Risks / Trade-offs

- **[Olvidar una tabla hija futura en el clonado]** → lista única `DATA_TABLES` en un solo módulo + columnas por introspección; nota en el código apuntando a esa constante desde el sitio donde se crean tablas hijas (migraciones).
- **[Update perdido: el padre cambia mientras se simula (n8n, otro usuario)]** → el apply sobrescribe. Mitigación: `base_fingerprint` al clonar; el diff/apply devuelve `base_changed` y el modal lo avisa en rojo antes de confirmar. No se bloquea el apply (decisión: el supervisor manda).
- **[Fallo a mitad de apply]** → todo el intercambio de datos va en una única transacción; el recalc posterior es idempotente y re-ejecutable con "Actualizar".
- **[Clon visible por un hueco no contemplado]** → los puntos de fuga conocidos (`/weeks` próxima, `ON CONFLICT`, upload-webhook) se corrigen aquí; el resto de lecturas siempre parten de un `plan_id` explícito o de `getActivePlanId()` que ya excluye `simulation`. Riesgo residual bajo.
- **[El usuario cierra sesión/navegador con simulación abierta]** → `/mine` la recupera en el próximo login; si no vuelve, el janitor la borra a las 24 h.
- **[`plan_tolva_settings` tiene `UNIQUE(plan_id, tolva_id)`]** → el clonado inserta con el `plan_id` nuevo, sin conflicto; el apply borra antes de copiar. Sin riesgo, documentado para el implementador.
- **[Doble clic / carreras al clonar]** → `POST /` comprueba si el usuario ya tiene clon abierto y devuelve 409 con el existente; el frontend reusa.

## Migration Plan

1. Desplegar código + migración juntos (el runner aplica `migrate-simulation-mode.sql` al arrancar, antes de servir tráfico).
2. La migración es idempotente (`IF EXISTS`/`IF NOT EXISTS`); en BBDD ya migradas no hace nada.
3. **Rollback**: revertir el código; opcionalmente recrear la constraint (`ALTER TABLE ... ADD CONSTRAINT weekly_plans_week_start_unique UNIQUE (week_start)`) tras borrar los planes `simulation` residuales (`DELETE FROM weekly_plans WHERE status='simulation'` + hijos). Las columnas nuevas son inocuas si quedan.

## Open Questions

- Ninguna bloqueante. Las decisiones de producto (§14 de `DOCS/PROPUESTA_SIMULACION.md`) están cerradas; la nº 1 (lecturas no editables) quedó pendiente de confirmación formal del usuario pero se implementa según la recomendación registrada.
