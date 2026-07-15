## Why

Los supervisores necesitan **probar cambios y ver la proyección antes de aceptarlos** (paradas, viajes extra, productividad, boxes). Hoy cada cambio se guarda y recalcula de inmediato sobre el plan real: no hay "deshacer" ni "previsualizar", y un experimento a medias queda visible para todos (otros usuarios, n8n/Telegram). El diseño ya está cerrado en `DOCS/PROPUESTA_SIMULACION.md` (decisiones del §14 tomadas en julio 2026); toca implementarlo.

## What Changes

- **Modo simulación global por plan clon**: al entrar, el backend clona el plan que se está viendo (solo vigente o próxima) en un plan con `status = 'simulation'`; el frontend rutea todo su tráfico al clon vía el `plan_id` existente. Todos los endpoints actuales funcionan sin cambios sobre el clon.
- **Aplicar / Cancelar**: "Aplicar" sobrescribe en transacción los datos hijos del plan real con los del clon (el `id` real no cambia — n8n no se rompe), recalcula con `notify:true` y borra el clon. "Cancelar" borra el clon. Antes de aplicar se muestra un **resumen del diff** (clon vs. real) con confirmación explícita.
- **Señalización inequívoca**: aura roja difuminada en todo el shell + cartel sticky "MODO SIMULACIÓN — los cambios NO son reales" con los botones globales, visible en todas las vistas (vive en `Layout`).
- **Silencio de webhooks/alertas en simulación**: `recalcPlan` fuerza `notify:false` si el plan es `simulation`; el webhook `plan_uploaded` de upload también se suprime para clones. Solo el "Aplicar" final notifica, sobre el plan real.
- **Modelo de datos**: la restricción `UNIQUE(week_start)` pasa a **índice único parcial** (`WHERE status <> 'simulation'`) para que el clon pueda compartir semana con el real; columnas nuevas `parent_plan_id`, `simulation_owner`, `base_fingerprint` en `weekly_plans`. **BREAKING (interno)**: los `ON CONFLICT (week_start)` de `helpers.js` y `planning.js` deben actualizarse al predicado parcial en el mismo despliegue.
- **Invisibilidad de los clones**: `/api/planning/weeks` y la resolución normal de semanas excluyen `status = 'simulation'` (hoy la query de "próxima" elegiría el clon por `week_start` — hay que filtrarlo).
- **Restricciones durante la simulación**: selector de semana bloqueado ("Simulando sobre: Semana X"), edición de Tolvas deshabilitada (config global, no clonable — §6 de la propuesta), lecturas de nivel **no editables** (solo se arrastran; son hechos medidos, decisión §14.1).
- **Simulación por usuario**: cada supervisor tiene su propio clon (`simulation_owner`); endpoint para recuperar la simulación en curso tras un refresh; janitor que borra clones huérfanos por antigüedad.
- **Aviso de "plan base cambió"**: fingerprint del padre al clonar; si al aplicar el padre cambió (p. ej. n8n tocó la vigente), el diff lo avisa.

## Capabilities

### New Capabilities
- `simulation-mode`: ciclo de vida completo del modo simulación — clonado de plan, ruteo por `plan_id`, diff clon vs. real, aplicar/cancelar transaccional, supresión de notificaciones, señalización visual, restricciones de edición y limpieza de clones huérfanos.

### Modified Capabilities
<!-- No hay specs previas en openspec/specs; el comportamiento existente afectado (weeks, ON CONFLICT, recalc) queda cubierto como requisitos de compatibilidad dentro de simulation-mode. -->

## Impact

- **BBDD**: migración nueva `migrate-simulation-mode.sql` (añadida al final de `MIGRATIONS` en `backend/src/db/migrate.js`): drop de `weekly_plans_week_start_unique`, índice único parcial `weekly_plans_week_start_real`, columnas `parent_plan_id`, `simulation_owner`, `base_fingerprint`.
- **Backend**:
  - `backend/src/db/helpers.js` — `ON CONFLICT (week_start)` → predicado parcial.
  - `backend/src/routes/planning.js` — ídem en `/weeks`; excluir `simulation` de la query de "próxima"; montar el subrouter de simulación.
  - `backend/src/services/recalc.js` — guarda: si el plan es `simulation`, forzar `notify:false`.
  - `backend/src/routes/upload.js` — suprimir webhook `plan_uploaded` para clones.
  - Nuevos: `backend/src/services/simulationPlans.js` (clonar/aplicar/descartar/diff/fingerprint/janitor, con lista única de tablas hijas) y `backend/src/routes/simulation.js` (`POST /`, `GET /mine`, `GET /:id/diff`, `POST /:id/apply`, `DELETE /:id`).
  - `backend/src/server.js` — arranque del janitor.
- **Frontend**:
  - `frontend/src/context/PlanContext.jsx` — `isSimulating`, `simulation`, start/apply/cancel, recuperación vía `/mine`.
  - `frontend/src/components/Layout.jsx` (+ CSS) — aura + cartel + barra Aplicar/Cancelar.
  - `frontend/src/components/WeekSelector.jsx` — bloqueado en simulación + botón "Simular cambios".
  - Modal de diff (componente nuevo); `frontend/src/pages/Tolvas.jsx` y `frontend/src/pages/Dashboard.jsx` (lecturas de nivel) — edición bloqueada en simulación.
- **Sistemas externos**: n8n/Telegram no ven clones ni reciben avisos de recálculos simulados; el `plan_id` real se mantiene estable al aplicar.
- **Docs**: `DOCS/API.md` / OpenAPI (endpoints nuevos), `DOCS/HANDOFF.md` (pasa de "no implementado" a implementado).
