## 1. Modelo de datos y compatibilidad

- [x] 1.1 Crear `backend/src/db/migrate-simulation-mode.sql` (idempotente): drop `weekly_plans_week_start_unique`, índice único parcial `weekly_plans_week_start_real` (`WHERE status <> 'simulation'`), columnas `parent_plan_id`, `simulation_owner`, `base_fingerprint` en `weekly_plans`
- [x] 1.2 Añadir `migrate-simulation-mode.sql` AL FINAL de `MIGRATIONS` en `backend/src/db/migrate.js`
- [x] 1.3 Actualizar `ON CONFLICT (week_start)` → `ON CONFLICT (week_start) WHERE status <> 'simulation'` en `backend/src/db/helpers.js` (`getActivePlanId`) y `backend/src/routes/planning.js` (`/weeks`)
- [x] 1.4 Excluir clones en `/weeks`: añadir `AND wp.status <> 'simulation'` a las dos queries de "próxima" en `backend/src/routes/planning.js`
- [x] 1.5 Verificar: arrancar backend (migración aplicada en `_migrations`), crear a mano un plan `simulation` con el mismo `week_start` que la vigente y comprobar que `/weeks` no lo muestra y que el arranque/rollover no duplica planes (verificado: índice parcial creado, constraint vieja fuera, columnas nuevas, clon invisible en /weeks)

## 2. Servicio de simulación (backend)

- [x] 2.1 Crear `backend/src/services/simulationPlans.js` con la lista única `DATA_TABLES` (trips, stoppages, box_entries, level_readings, productivity_periods, plan_tolva_settings) y `RESULT_TABLES` (sequence_results, silo_simulation)
- [x] 2.2 Implementar copia dinámica de tablas hijas por introspección de `information_schema.columns` (excluir `id`, `plan_id`) — usada por clonar y aplicar
- [x] 2.3 Implementar `computeFingerprint(planId)`: sha256 estable del contenido de `DATA_TABLES` (filas ordenadas, sin `id`/`plan_id`)
- [x] 2.4 Implementar `clonePlan(parentId, owner)`: valida que el padre es vigente/próxima (status `active`/`draft`, semana actual o siguiente) y no es clon; transacción (cabecera + hijos); después `recalcPlan(clon, {trigger:'simulation_start', notify:false})`
- [x] 2.5 Implementar `getSimulationDiff(cloneId)`: altas/bajas/modificados por tabla, KPIs padre vs. clon (viajes con retraso, horas de parada, stock mínimo) y `base_changed` por fingerprint
- [x] 2.6 Implementar `applySimulation(cloneId)`: transacción única (borrar hijos del padre — datos y resultados —, copiar datos del clon, borrar clon + hijos); tras COMMIT, `recalcPlan(padre, {trigger:'simulation_apply', notify:true})`
- [x] 2.7 Implementar `discardSimulation(cloneId)`: borrar clon + todos sus hijos
- [x] 2.8 Implementar `cleanupStaleSimulations(maxAgeHours=24)` y engancharla en `backend/src/server.js` (al arrancar + `setInterval` cada 6 h)

## 3. API de simulación

- [x] 3.1 Crear `backend/src/routes/simulation.js` con `POST /` (409 con el clon existente si el usuario ya tiene uno), `GET /mine`, `GET /:id/diff`, `POST /:id/apply`, `DELETE /:id`; validación de propiedad (`simulation_owner` = `req.user.email`, o superadmin) y de `status='simulation'`
- [x] 3.2 Montar el subrouter en `backend/src/routes/planning.js` (`router.use('/simulation', ...)`) tras el `GET /simulation` existente
- [x] 3.3 Verificar con curl el ciclo completo: crear → mutar (parada con `plan_id` del clon) → diff → apply (padre actualizado, mismo id, clon borrado) y crear → cancelar (padre intacto) (script Node contra la API: 20/20 checks + apply verificado desde la UI)

## 4. Supresión de notificaciones

- [x] 4.1 En `backend/src/services/recalc.js`: consultar `status` del plan al inicio y forzar `notify=false` si es `'simulation'`
- [x] 4.2 En `backend/src/routes/upload.js`: suprimir `notifyWebhooks('plan_uploaded', ...)` cuando el plan destino es un clon
- [x] 4.3 Revisar el resto de call sites de `notifyWebhooks`/`checkAlerts` por si alguno puede operar sobre un clon; guardar los que apliquen (encontrados y guardados: `trips.js` ×3 — extra/update/divert — y `stoppages.js` ×1, con helper `isSimulationPlan` en `db/helpers.js`)
- [x] 4.4 Verificar: con un webhook de prueba configurado, recalcular un clon con `notify:true` → cero webhooks; aplicar → webhooks del padre emitidos (listener local + webhook temporal: FASE A silencio total, FASE B recalculate_done/delay_detected/empty_prediction; webhook borrado tras el test)

## 5. Frontend: contexto y señalización

- [x] 5.1 `PlanContext.jsx`: estado `simulation`/`isSimulating`, `startSimulation()`, `applySimulation()`, `cancelSimulation()`; al simular apuntar `planId` al clon y recordar el plan base para restaurarlo al salir
- [x] 5.2 Al montar, consultar `GET /api/planning/simulation/mine` y ofrecer retomar o descartar la simulación abierta
- [x] 5.3 `Layout.jsx` + CSS: aura roja inset con animación de respiración y cartel sticky "MODO SIMULACIÓN — los cambios NO son reales · Simulando sobre: Semana X" con botones "Aplicar cambios" y "Cancelar simulación" (componente `SimulationBanner.jsx` montado en Layout)
- [x] 5.4 `WeekSelector.jsx`: deshabilitado en simulación (mostrando la semana base) + botón "Simular cambios" visible solo en vigente/próxima
- [x] 5.5 Componente modal de diff: consume `GET /:id/diff`, muestra resumen por tabla + KPIs comparados + aviso destacado si `base_changed`; el apply solo tras confirmar (dentro de `SimulationBanner.jsx`)

## 6. Frontend: restricciones de edición

- [x] 6.1 `Tolvas.jsx`: deshabilitar edición en simulación con nota "No editable en simulación (configuración global de tolva)"
- [x] 6.2 `Dashboard.jsx`: deshabilitar añadir/borrar lecturas de nivel en simulación con nota explicativa

## 7. Verificación end-to-end y documentación

- [x] 7.1 Recorrido completo en navegador: Simular → añadir parada + viaje extra + franja de productividad → gráfico/KPIs del clon cambian en vivo → en otra pestaña sin simular, el plan real intacto → Aplicar con diff → el real refleja los cambios; repetir con Cancelar (GIF grabado: modo-simulacion-demo.gif; parada de demo revertida del plan real al acabar)
- [x] 7.2 Probar refresh a mitad de simulación (retomar vía `/mine`) y doble intento de crear simulación (409 reusa) (refresh → banner Retomar/Descartar → retomada → cancelada; 409 verificado por API)
- [x] 7.3 Actualizar `DOCS/API.md` y `backend/src/docs/openapi.js` (+ regenerar `DOCS/API.openapi.json` si procede) con los endpoints nuevos
- [x] 7.4 Actualizar `DOCS/HANDOFF.md` y `DOCS/PROPUESTA_SIMULACION.md` (marcar implementado, checklist §13) y añadir casos al `DOCS/CASOS_DE_PRUEBA.md`
