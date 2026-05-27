# SARVAL — Handoff / Estado del proyecto

> Documento para retomar el trabajo en una sesión nueva sin perder contexto.
> Última actualización: 28 may 2026.

## 1. Qué es SARVAL
App web para planificar las **descargas de camiones en silos (tolvas)** de una planta. Sustituye un Excel + script. Simula el nivel del silo a lo largo de la semana operativa (**Lunes 06:00 → Sábado 22:00**, consumo continuo incluidas las noches), decide cuándo descarga cada camión (prioridad a los **críticos**), y avisa de retrasos y paradas. Preparada para integrarse con un **bot de n8n/Telegram** (FASE 2, aún no conectado).

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
Login: `adminsarval` / `adminsarval123`. El `backend/.env` apunta a la **MISMA BBDD de producción** (`91.99.128.20:5400/sarval`). Todos los datos son de prueba. Plan con datos de demo: **Semana 10 (plan_id 28)**, 79 viajes, 2 tolvas.

## 3. ⚠️ Estado del repositorio (IMPORTANTE)
- Último commit: `533ba79`.
- **Todo lo de la sesión del 27-28 may está SIN COMMITEAR** (ver `git status`). Hay que hacer commit + push para que Dokploy lo despliegue.
- **Migraciones ya aplicadas en la BBDD de producción** pero con archivos sin commitear:
  - `migrate-level-readings.sql` (tabla `level_readings`)
  - `migrate-productivity-periods.sql` (tabla `productivity_periods`)
  - (Ya commiteadas y aplicadas antes: `producto` en trips, `trip_number` como VARCHAR único.)
- Al desplegar: la BBDD ya tiene las columnas/tablas; solo falta subir el código. No reaplicar migraciones.

## 4. Lo implementado en esta sesión (sin commitear)

### Motor (`simulator.js`)
- **Caudal de consumo variable por franjas** (`buildRateMap`): cada franja de productividad sustituye el `consumo_tn_h` base en su tramo; en solapamientos gana la franja de mayor id.
- **Paradas pausan TODA actividad**: durante una parada no hay consumo, ni descargas de camión, ni entrada de boxes.
- **Boxes se posponen** durante paradas (no gotean; entregan el total después).
- **Lecturas de nivel reanclan** la simulación (`buildReadingMap`): en el paso de la lectura, el nivel real sustituye al estimado, y recalcula de ahí en adelante (afecta a curva Y secuencia). El pasado no cambia.

### Recálculo estandarizado (clave de arquitectura)
- **Servicio único** `backend/src/services/recalc.js` → `recalcPlan(planId, { trigger, notify })`.
- **Toda acción que altera la simulación recalcula sola** (backend): upload, crear/editar/borrar viaje, desviar, parada (CRUD), box (CRUD), lectura (crear/borrar), productividad (CRUD), parámetros de tolva. El frontend ya no recalcula a mano; solo recarga.
- El botón **"Actualizar"** queda como recálculo manual de respaldo (único con `notify:true`).
- **Webhooks pendientes para más adelante**: `recalcPlan` ya recibe `trigger` (qué lo disparó) y calcula `newly_delayed` (diff de retrasos), pero **no emite webhooks en acciones automáticas**. Cuando se monten los avisos (retrasos, paradas, vaciado, tareas por perfil en Telegram, endpoints específicos del bot), se enganchan en ESE único punto. El usuario quiere arquitectura flexible para varios tipos de eventos/perfiles.

### Lecturas de nivel manual (no hay células de pesada)
- Tabla `level_readings`, ruta `/api/level-readings` (GET/POST/DELETE).
- UI en **Dashboard**: botón "Registrar nivel real" (día/hora pre-rellenados a "ahora" redondeado al paso, editable), marcador morado en la curva, historial con borrado.

### Productividad (vista nueva)
- Tabla `productivity_periods`, ruta `/api/productivity-periods` (CRUD). Vista `frontend/src/pages/Productividad.jsx` (menú entre Tolvas y Paradas).
- **Calendario semanal visual**: banda por día; verde = franja específica con su t/h escrito **en cada celda de hora**; gris suave = caudal base; rayado = fuera de operación; líneas verticales discontinuas por hora; línea roja "ahora".
- **No toca el pasado**: en semana vigente, franja ya empezada → bloqueada (🔒); crear en el pasado → rechazado. Semana pasada → solo lectura. Ajuste hacia adelante = añadir franja nueva que pisa (overlap, gana la más reciente).

### Secuenciación
- Editar viaje **inline** (sin ir a Planificación): día/hora/proveedor/producto/ton/crítico/retraso/nueva hora/estado. Fila resaltada, columna **Acciones sticky** a la derecha.
- **Selector de columnas** (persiste en localStorage).
- Columna **"Nivel previo (tn)"**: nivel del silo justo antes de la hora prevista del viaje (incluye boxes).
- **Retraso (h) con 2 decimales** (para pasos de cuarto de hora).
- Críticos con **chip verde** (se quitó el bold).
- Bug corregido: `/api/planning/sequence` ahora devuelve `trip_id` (antes el divert/editar no tenían el id real).

### Dashboard / gráfico
- Curva en **dientes de sierra** (salto vertical = tn exactas descargadas).
- Quitado `syncId` entre paneles (evita doble tooltip desalineado).
- Ejes Y **redondeados** (sin decimales raros).
- Panel de flujos con **escala fija ±capacidad** de la tolva.
- Tooltip de flujos muestra **cada viaje (matrícula + tn)**, críticos con etiqueta **CR**; sin matrícula → `[indefinido]`.
- Botón **"← Todas las tolvas"**; en multi-tolva sin selección no muestra gráfico ambiguo.

### Tablas
- Usan todo el ancho disponible (ya commiteado antes).

## 5. Decisiones PENDIENTES del cliente
Ver `DOCS/PROPUESTA_MOTOR_SECUENCIACION.md` (Bloques A, B, C). Resumen:
- **A.1** Duración de descarga (fija / por tn / por proveedor / mixta). **A.2 confirmado: 1 boca por tolva.** A.3 tiempo muerto entre camiones. A.4 boxes ¿comparten boca? A.5 confirmado: salto instantáneo. A.6 resolución temporal del motor (bajar paso a 5/15 min para horas no múltiplos del paso).
- **B** Reglas estrictas: ¿peor parar planta o retrasar crítico? nivel mínimo de seguridad, ventana de protección de críticos, orden entre críticos simultáneos, evaluación individual vs acumulada de no-críticos, avisos de parada.
- **C** Boxes flexibles (¿modo lineal/flexible? ¿tasa máx por box?) — pendiente reunión.

## 6. Próximos pasos sugeridos
1. **Commit + push** de todo el lote (no perder el trabajo; desplegar).
2. Recoger respuestas del cliente a los Bloques A/B/C y ajustar el motor.
3. Modelar **duración de descarga + 1 boca/tolva** (cola física), probablemente bajando el paso.
4. Montar los **webhooks por evento** y los **endpoints del bot** (n8n/Telegram), usando `trigger` + `newly_delayed` de `recalcPlan`.
5. Endurecer en backend el bloqueo de "no editar el pasado" en productividad (hoy es UI).
6. Sacar la ventana operativa (Lunes 06:00–Sábado 22:00) a parámetro configurable (hoy hardcodeada en motor y en Productividad).

## 7. Validación
`DOCS/CASOS_DE_PRUEBA.md` — checklist completo de casos a testear.

## 8. Cómo trabaja el usuario (preferencias)
- Quiere que **piense y proponga antes de actuar** en cambios de diseño/negocio.
- Le gusta **verificar end-to-end** (probar contra datos reales, revertir las pruebas).
- Trabajamos en **local sin pushear** hasta que él dé el OK; commitear en lote cuando lo pida.
- Documentos y comunicación en **español** (alguna cosa para el cliente en **catalán**).
