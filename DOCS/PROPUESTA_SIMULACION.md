# Propuesta: Modo Simulación (para v2)

> Documento de diseño. **IMPLEMENTADO en julio 2026** (cambio OpenSpec
> `modo-simulacion`; endpoints en `DOCS/API.md` §Modo simulación).
> Escrito tras la sesión de mayo 2026 (extensión a Domingo, ventana de consumo,
> prevención de planes duplicados con `UNIQUE(week_start)`).

## 1. Problema que resuelve

Los supervisores quieren **probar cambios y ver cómo afectan al resultado antes de
aceptarlos**. Esos cambios pueden tocar muchas áreas a la vez: secuenciación,
viajes extras, productividad, boxes, paradas. Hoy cada cambio se guarda y recalcula
de inmediato sobre el plan real (no hay "deshacer" ni "previsualizar").

Queremos:
- Un **modo simulación** claramente señalizado (aura difuminada + cartel rojo en todas las vistas).
- Botones globales **"Aplicar cambios"** y **"Cancelar simulación"**.
- Que durante la simulación todo funcione **igual que siempre** (gráfico, secuenciación, KPIs se actualizan en tiempo real), sin tener que añadir botones de "simular/guardar" en cada vista.

## 2. Por qué simulación GLOBAL y no por vista/área

Descartado simular "solo una vista". Motivo: **todo está acoplado a través del motor**.
Un cambio en productividad cambia la curva del silo → cambia cuándo cabe cada camión →
cambian los retrasos en secuenciación → cambian los KPIs del dashboard. Una parada
nueva pospone boxes y camiones. No se puede aislar "la simulación de productividad"
porque su efecto cascada toca el resto. El recálculo (`recalcPlan`) es holístico: corre
el plan entero de una vez. Por tanto **la simulación es una sola, global, que acumula
todos los cambios de todas las áreas**.

## 3. El reto real: ¿dónde se acumula el estado?

El usuario lo detectó bien: lo difícil es **acumular el estado de los cambios simulados**.
Dos sitios posibles:

- **En memoria (frontend)**: inviable. El motor vive en el backend y es complejo
  (`backend/src/engine/simulator.js`). Para ver el gráfico/secuencia simulados habría
  que recalcular, y recalcular necesita los datos en BBDD. Replicar el motor en el
  cliente triplicaría el trabajo y se desincronizaría.
- **En BBDD, en un plan aislado (clon)**: viable y limpio. El estado se acumula en un
  plan clon; el motor sigue siendo el del backend; al terminar se promociona o se borra
  de forma atómica. **Esta es la propuesta.**

Idea clave: **no acumulamos un "diff" en memoria**. Acumulamos los cambios en un plan
de BBDD aislado, que luego se **aplica** (reemplaza al real) o se **descarta** entero.

## 4. Aproximación recomendada: plan clon (`status = 'simulation'`)

Al entrar en modo simulación:
1. El backend **clona el plan que se está viendo** (vigente o próxima) en un plan nuevo
   con `status = 'simulation'`, copiando todos sus datos hijos.
2. El frontend apunta el `plan_id` activo al clon (`PlanContext`).
3. A partir de ahí, **todos los endpoints existentes funcionan sin cambios**: resuelven
   `plan_id` (el del clon) y `recalcPlan` reescribe la secuencia/simulación del clon.
4. El gráfico, la secuenciación y los KPIs muestran el clon automáticamente (ya usan `plan_id`).

Al **Aplicar**: los datos del clon sobrescriben al plan real (en transacción), se
recalcula el real y se borra el clon. → El `id` del plan real **no cambia** (importante
para n8n/webhooks/enlaces que lo referencian).

Al **Cancelar**: se borra el clon y sus hijos. El frontend vuelve a apuntar al plan real.

### Por qué esta opción
- No duplica la lógica del motor.
- Aislamiento total: nadie más (otros usuarios, n8n) ve los datos simulados, porque el
  clon es invisible para la resolución normal de semanas.
- Reutiliza casi todo lo que ya existe (`recalcPlan`, routing por `plan_id`, patrón de
  limpieza de planes).

## 5. Alcance del clon vs. alcance editable

Conviene separar dos conceptos:

- **Alcance del clon (para una base fiel)**: se copian **todos** los datos hijos del plan,
  aunque algunos no se editen en simulación, para que el punto de partida sea idéntico al real:
  `trips`, `stoppages`, `box_entries`, `productivity_periods`, `level_readings`,
  `plan_tolva_settings` (override de nivel inicial por semana).
  `sequence_results` y `silo_simulation` **no se copian**: los regenera `recalcPlan`.
- **Alcance editable en simulación (lo que pide el usuario)**: secuenciación + viajes
  extras (`trips`), productividad (`productivity_periods`), boxes (`box_entries`),
  paradas (`stoppages`). Opcional: lecturas de nivel (`level_readings`).

## 6. Limitación conocida: configuración global de la tolva

La config de la tolva (`capacidad_tn`, `consumo_tn_h`, `paso_minutos`,
`hora_inicio_consumo`, `hora_fin_consumo`) vive en la tabla `tolvas` y es **global**, no
por plan. Por tanto **no se puede simular "qué pasa si cambio el consumo de la tolva"**
con el enfoque de clon, porque cambiar la tolva afectaría también a los planes reales.

- En v2 (alcance mínimo) → **se deshabilita/oculta la edición de Tolvas durante la simulación**.
- El nivel inicial por semana SÍ es simulable (vive en `plan_tolva_settings`, que se clona).
- Extensión futura: snapshotear la config de tolva por plan (columna/tabla por `plan_id`)
  para poder simular también cambios de tolva. Es un refactor mayor; queda fuera de v2.

## 7. Cambios en el modelo de datos

1. **Índice único parcial en vez de la restricción actual.**
   Hoy existe `weekly_plans_week_start_unique UNIQUE (week_start)` (añadida esta sesión
   para evitar planes duplicados). El clon tiene el **mismo `week_start`** que el original
   → violaría la unicidad. Solución: sustituir la restricción por un **índice único parcial**
   que excluya las simulaciones:
   ```sql
   ALTER TABLE weekly_plans DROP CONSTRAINT weekly_plans_week_start_unique;
   CREATE UNIQUE INDEX weekly_plans_week_start_real
     ON weekly_plans (week_start)
     WHERE status <> 'simulation';
   ```
   Así los planes reales siguen siendo únicos por semana, y puede haber N clones de
   simulación sobre la misma semana sin chocar.

2. **Columnas nuevas en `weekly_plans`** (para gestionar los clones):
   - `parent_plan_id INTEGER` → de qué plan real es clon (para "aplicar").
   - `simulation_owner` → usuario/sesión dueña de la simulación (multi-supervisor).
   - `created_at` ya existe → sirve para limpiar simulaciones huérfanas.

3. **`getActivePlanId()` y `/weeks` no cambian**: ya filtran por `active`/`draft`/`archived`,
   así que los planes `simulation` quedan **invisibles** para la navegación normal de semanas. ✅

## 8. Endpoints nuevos

- `POST /api/planning/simulation` → clona el plan activo (o el `plan_id` indicado),
  devuelve `{ simulation_plan_id, parent_plan_id }`.
- `POST /api/planning/simulation/:id/apply` → en transacción: sobrescribe los hijos del
  `parent_plan_id` con los del clon, `recalcPlan(parent, { notify: true })`, borra el clon.
- `DELETE /api/planning/simulation/:id` → borra el clon y sus hijos (patrón del script
  `cleanup-empty-plans.js`).

> **Webhooks/avisos:** durante la simulación, `recalcPlan` se llama **siempre con
> `notify:false`** (igual que las acciones automáticas hoy). Así n8n/Telegram **no** avisan
> de retrasos/paradas ficticios. Solo el "Aplicar" final dispara `notify:true` sobre el
> plan real.

## 9. Frontend

- **`PlanContext`**: añadir `simulationPlanId` e `isSimulating`. Cuando se simula,
  `window.__SARVAL_PLAN_ID = simulationPlanId` (el resto de la app no se entera, sigue
  usando `api()` igual).
- **Señalización (CSS/JSX, trivial)**: aura difuminada alrededor del shell (p.ej.
  `box-shadow: inset 0 0 0 4px rgba(239,68,68,.6)` + un glow), y un **cartel rojo fijo**
  "MODO SIMULACIÓN — los cambios no son reales" presente en todas las vistas (en el
  `Layout`, no por página).
- **Barra de acciones global** (en el cartel): "Aplicar cambios" y "Cancelar simulación".
- **Entrada**: botón "Simular cambios" (junto al selector de semana). Al activarlo, se
  bloquea el selector de semana ("Simulando sobre Semana X") y se oculta/deshabilita la
  edición de Tolvas (fuera de alcance, ver §6).

## 10. Semántica de Aplicar / Cancelar

- **Aplicar** (recomendado, preserva el `id` del plan real):
  1. `BEGIN`
  2. Borrar hijos del `parent_plan_id` (trips, stoppages, box_entries, productivity_periods,
     level_readings, plan_tolva_settings).
  3. Copiar los hijos del clon al `parent_plan_id`.
  4. `recalcPlan(parent, { notify: true })`.
  5. Borrar el clon (y sus hijos).
  6. `COMMIT`
  - Alternativa más simple pero peor: promocionar el clon a `active` y archivar/borrar el
    original. Cambia el `id` del plan vigente → rompe referencias externas (n8n). **No recomendada.**
- **Cancelar**: borrar el clon + hijos. Frontend vuelve a `parent_plan_id`.

## 11. Concurrencia y simulaciones huérfanas

- **Multi-supervisor**: cada uno crea su propio clon (`simulation_owner`). Conviven sin chocar
  gracias al índice parcial.
- **Update perdido**: si se simula la vigente y, mientras, llega un cambio real a la vigente
  (p.ej. desde n8n), al "Aplicar" se sobrescribiría ese cambio. Mitigación: comparar un
  `updated_at`/versión del `parent` al aplicar y avisar si cambió desde que se clonó
  ("el plan base ha cambiado, revisa antes de aplicar").
- **Clones abandonados**: si el supervisor cierra el navegador, el clon queda colgado.
  Janitor que borre `status='simulation'` con `created_at` > N horas (extender
  `cleanup-empty-plans.js`).

## 12. Alternativa descartada: snapshot/restore sobre el plan real

En vez de clonar, hacer los cambios sobre el plan real y guardar un snapshot (JSON/tabla
backup) para restaurar al cancelar.
- **Más simple** (no toca el índice único, no hay routing de `plan_id`).
- **Pero inseguro en producción**: durante la simulación el plan real mostraría datos
  ficticios a todos (otros usuarios, n8n, dashboards). Para la semana **vigente** eso es
  inaceptable. Solo valdría si nadie más lee el plan a la vez. → Descartada para un sistema vivo.

## 13. Checklist de implementación (v2) — COMPLETADO julio 2026

- [x] Migración: índice único parcial; columnas `parent_plan_id`, `simulation_owner` (+ `base_fingerprint`) → `migrate-simulation-mode.sql`.
- [x] `POST /api/planning/simulation` (clonar hijos del plan, por introspección de columnas).
- [x] `POST /api/planning/simulation/:id/apply` (transacción de sobrescritura + recalc notify).
- [x] `DELETE /api/planning/simulation/:id` (borrar clon + hijos).
- [x] `recalcPlan` siempre `notify:false` mientras `status='simulation'` (+ guardas en webhooks directos de trips/stoppages/upload).
- [x] `PlanContext`: `isSimulating`, `simulation`, routing de `__SARVAL_PLAN_ID` (+ `GET /mine` para retomar tras refresh).
- [x] `Layout`: aura + cartel rojo + barra "Aplicar/Cancelar" (`SimulationBanner.jsx`).
- [x] Botón "Simular cambios"; bloquear selector de semana y edición de Tolvas en simulación (+ lecturas de nivel, §14).
- [x] Janitor de clones huérfanos (>24 h, al arrancar y cada 6 h).
- [x] Aviso de "plan base cambió" al aplicar (fingerprint del padre al clonar; `base_changed` en el diff).

## 14. Decisiones (cerradas en julio 2026)

- **Lecturas de nivel (`level_readings`)**: NO editables en simulación, solo se arrastran
  (se clonan tal cual). Son hechos medidos, no decisiones; si fueran editables, un "Aplicar"
  sobrescribiría mediciones reales con datos inventados. Para "¿y si el nivel fuera otro?"
  ya sirve el nivel inicial de semana (`plan_tolva_settings`), que sí se simula.
  *(Implementado según esta recomendación.)*
- **Semanas simulables**: solo **vigente y próxima**. Las archivadas no se simulan.
- **"Aplicar"**: pide **confirmación explícita** y muestra el **resumen del diff** (§19)
  antes de sobrescribir → el diff pasa de opcional a parte del MVP.
- **Ámbito**: la simulación es **por usuario** (`simulation_owner`); cada supervisor tiene
  su propio clon. El cambio aplicado, evidentemente, es para todos (sobrescribe el plan real).

## 15. Artefactos relacionados del repo
- `backend/src/engine/simulator.js` — motor (holístico, justifica la simulación global).
- `backend/src/services/recalc.js` — `recalcPlan(planId, { trigger, notify })`, punto único.
- `backend/src/db/helpers.js` — `getActivePlanId`, `resolvePlanId` (ignoran `simulation`).
- `backend/src/db/migrate-unique-week.sql` — la restricción que hay que volver parcial.
- `backend/scripts/cleanup-empty-plans.js` — patrón de borrado de planes + hijos.
- `frontend/src/context/PlanContext.jsx` — donde vive el `plan_id` activo.
- `frontend/src/components/Layout.jsx` — donde irían aura/cartel/barra de acciones.

## 16. Flujo de usuario (walkthrough)

1. El supervisor está viendo la **Semana 22 (vigente)**. Pulsa **"Simular cambios"**.
2. El backend clona la Semana 22 → plan `simulation` (id 105, `parent_plan_id=59`).
   El frontend pasa a apuntar a 105. Aparece el **aura roja** y el **cartel "MODO SIMULACIÓN"**.
3. El supervisor va a **Paradas** y añade una parada el Miércoles 10:00–14:00.
   → Se guarda en el plan 105 y `recalcPlan(105, {notify:false})` recalcula en silencio.
4. Va a **Productividad** y baja el caudal del Jueves a 8 t/h. → Igual, sobre el 105.
5. Va al **Dashboard**: el gráfico ya refleja parada + productividad (es el plan 105).
   La **Semana 22 real (plan 59) sigue intacta**; n8n y otros usuarios la ven sin tocar.
6. Decide: 
   - **"Aplicar cambios"** → los hijos del 105 sobrescriben al 59, se recalcula el 59 con
     `notify:true` (ahora sí avisa de los nuevos retrasos reales), se borra el 105.
     El supervisor vuelve a ver la Semana 22 (plan 59) ya con los cambios.
   - **"Cancelar simulación"** → se borra el 105, vuelve al 59 sin ningún cambio.

## 17. Señalización visual (boceto)

```
┌────────────────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░ aura roja difuminada en todo el borde ░░░░░░░░░░░░░░ │
│ ░ ┌──────────────────────────────────────────────────────────────┐ ░ │
│ ░ │ 🔴 MODO SIMULACIÓN — los cambios NO son reales               │ ░ │
│ ░ │     Simulando sobre: Semana 22   [Aplicar cambios] [Cancelar] │ ░ │
│ ░ └──────────────────────────────────────────────────────────────┘ ░ │
│ ░                                                                   ░ │
│ ░   (resto de la app normal: sidebar, dashboard, secuenciación…)   ░ │
│ ░                                                                   ░ │
└────────────────────────────────────────────────────────────────────┘
```
- Aura: `box-shadow` inset rojo + animación sutil de "respiración" para que sea inequívoco.
- Cartel: barra fija arriba (sticky), visible en TODAS las vistas → vive en `Layout`, no por página.
- El selector de semana se sustituye por "Simulando sobre: Semana X" (bloqueado).

## 18. Mecánica del clon (SQL de referencia)

Clonar = insertar el plan `simulation` y copiar cada tabla hija remapeando `plan_id`.
Patrón (a envolver en transacción y en una función `clonePlan(parentId, owner)`):

```sql
-- 1) Cabecera del clon
INSERT INTO weekly_plans (week_start, status, parent_plan_id, simulation_owner)
SELECT week_start, 'simulation', id, $owner
FROM weekly_plans WHERE id = $parent
RETURNING id;   -- => $clone

-- 2) Copiar hijos (uno por tabla). Ej. trips:
INSERT INTO trips (plan_id, trip_number, day, scheduled_time, supplier, producto,
                   tons, is_critical, is_extra, tolva_id /*, …resto de columnas */)
SELECT $clone, trip_number, day, scheduled_time, supplier, producto,
       tons, is_critical, is_extra, tolva_id
FROM trips WHERE plan_id = $parent;
-- …repetir para stoppages, box_entries, productivity_periods,
--    level_readings, plan_tolva_settings.
-- NO copiar sequence_results ni silo_simulation.

-- 3) Generar resultados del clon
--    (en código) await recalcPlan($clone, { notify:false });
```
> Nota de mantenimiento: cada vez que se añada una tabla hija con `plan_id`, hay que
> incluirla en clonar / aplicar / cancelar. Conviene centralizar la lista de "tablas
> hijas de un plan" en una constante única (backend) para no olvidar ninguna —el mismo
> riesgo que ya tiene `cleanup-empty-plans.js`.

## 19. Vista de "resumen de cambios" (diff) — opcional pero recomendable

Antes de **Aplicar**, mostrar al supervisor un resumen de qué cambia respecto al plan real:
- Viajes añadidos/editados/borrados, paradas nuevas, franjas de productividad modificadas, boxes.
- Métricas comparadas: horas paradas, stock mínimo, nº de viajes con retraso (clon vs. real).

Se obtiene comparando los hijos del clon con los del `parent` (o KPIs de `/api/dashboard`
para ambos `plan_id`). No es imprescindible para el MVP, pero da confianza al "Aplicar".

## 20. Fases de implementación sugeridas

- **MVP (lo mínimo para que sea útil):** clonar / apply / cancel + routing de `plan_id` +
  aura/cartel + `notify:false` en simulación + bloquear edición de Tolvas. Sin diff, sin
  multi-usuario fino, con janitor simple por tiempo.
- **v2.1:** vista de diff/resumen antes de aplicar; aviso de "plan base cambió".
- **v2.2 (mayor):** snapshot de config de tolva por plan → permitir simular también
  cambios de capacidad/consumo/paso/ventana de la tolva (levanta la limitación de §6).

## 21. Interacción con la FASE 2 (bot n8n / Telegram)

- Los planes `simulation` deben quedar **fuera** de todo lo que consuma el bot: el bot
  trabaja sobre el plan vigente real vía los endpoints normales, que ya ignoran `simulation`.
- Regla de oro: **ningún webhook/aviso se emite por cambios simulados** (`notify:false`).
  El único disparo real ocurre en el "Aplicar", sobre el plan real.
- Por eso es importante mantener el `plan_id` real estable al aplicar (opción §10
  recomendada): si el bot/n8n tiene cacheado el `plan_id` de la semana, no se rompe.
