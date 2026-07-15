## ADDED Requirements

### Requirement: Entrar en modo simulación clona el plan
El sistema SHALL permitir a un usuario autenticado iniciar una simulación sobre el plan vigente o el próximo mediante `POST /api/planning/simulation`. Al iniciarla, el sistema SHALL crear un plan clon con `status = 'simulation'`, `parent_plan_id` apuntando al plan base, `simulation_owner` con la identidad del usuario y `base_fingerprint` con el hash del contenido actual de las tablas de datos del padre; SHALL copiar al clon todas las tablas hijas de datos (`trips`, `stoppages`, `box_entries`, `level_readings`, `productivity_periods`, `plan_tolva_settings`); SHALL NOT copiar `sequence_results` ni `silo_simulation`; y SHALL ejecutar el recálculo del clon sin notificaciones.

#### Scenario: Clonado del plan vigente
- **WHEN** un usuario sin simulación abierta hace `POST /api/planning/simulation` viendo la semana vigente
- **THEN** la respuesta incluye `simulation_plan_id` y `parent_plan_id`, el clon tiene los mismos datos hijos que el padre y sus propios `sequence_results`/`silo_simulation` recalculados

#### Scenario: Semana archivada rechazada
- **WHEN** se solicita simular sobre un plan con `status = 'archived'`
- **THEN** el sistema responde con error 4xx y no crea ningún clon

#### Scenario: Simulación ya abierta
- **WHEN** el usuario ya tiene un plan `simulation` abierto y solicita otro
- **THEN** el sistema responde 409 incluyendo el `simulation_plan_id` existente y no crea un segundo clon

### Requirement: Los endpoints existentes operan sobre el clon vía plan_id
Durante la simulación, el sistema SHALL atender todas las operaciones de lectura y escritura existentes (viajes, paradas, boxes, productividad, secuenciación, dashboard, upload) sobre el clon cuando la petición lleva su `plan_id`, sin endpoints nuevos por área, y cada mutación SHALL recalcular el clon igual que hoy recalcula un plan real.

#### Scenario: Añadir una parada en simulación
- **WHEN** se crea una parada con `plan_id` del clon y luego se consulta `GET /api/planning/simulation?plan_id=<clon>`
- **THEN** la curva del silo del clon refleja la parada, y los datos y resultados del plan padre permanecen intactos

### Requirement: Silencio total de notificaciones en simulación
El sistema SHALL suprimir webhooks y alertas (n8n/Telegram) para cualquier recálculo o acción cuyo plan objetivo tenga `status = 'simulation'`, aunque el llamante solicite notificar. El webhook `plan_uploaded` SHALL suprimirse igualmente cuando el upload va dirigido a un clon.

#### Scenario: Recálculo notificante sobre un clon
- **WHEN** se invoca el recálculo de un clon con `notify: true` (p. ej. botón "Actualizar" durante la simulación)
- **THEN** no se emite ningún webhook ni alerta

### Requirement: Los clones son invisibles para la navegación y sistemas externos
El sistema SHALL excluir los planes `status = 'simulation'` de `GET /api/planning/weeks` (vigente, próxima y pasadas) y de la resolución del plan activo (`getActivePlanId`), de modo que otros usuarios, el bot n8n y la navegación de semanas nunca vean un clon.

#### Scenario: Próxima semana con clon presente
- **WHEN** existe un clon de la semana próxima con viajes copiados y se consulta `GET /api/planning/weeks`
- **THEN** la "próxima" devuelta es el plan real de esa semana, nunca el clon

### Requirement: Diff previo con detección de cambios en el plan base
El sistema SHALL exponer `GET /api/planning/simulation/:id/diff` con: resumen por tabla de altas/bajas/modificaciones del clon respecto al padre (comparando filas sin `id` ni `plan_id`), KPIs comparados padre vs. clon (viajes con retraso, horas de parada por silo vacío, stock mínimo) y un indicador `base_changed` que SHALL ser `true` si el contenido actual del padre difiere del `base_fingerprint` capturado al clonar.

#### Scenario: Diff tras añadir un viaje extra
- **WHEN** se añade un viaje extra al clon y se consulta el diff
- **THEN** el resumen muestra 1 alta en `trips` y los KPIs comparados reflejan el efecto del viaje

#### Scenario: El padre cambió durante la simulación
- **WHEN** tras clonar, el plan padre recibe un cambio real (p. ej. vía n8n) y se consulta el diff
- **THEN** `base_changed` es `true`

### Requirement: Aplicar la simulación es transaccional y preserva el id del plan real
`POST /api/planning/simulation/:id/apply` SHALL, dentro de una única transacción: borrar los datos hijos y resultados del plan padre, copiar los datos hijos del clon al padre y borrar el clon con todos sus hijos. El `id` del plan padre SHALL NOT cambiar. Tras la transacción, el sistema SHALL recalcular el padre con notificaciones activadas (`notify: true`).

#### Scenario: Aplicar cambios simulados
- **WHEN** se aplica una simulación que añadió una parada
- **THEN** el plan real contiene la parada con su mismo `id` de plan de siempre, sus resultados se recalculan, se emiten los webhooks correspondientes y el clon ya no existe

#### Scenario: Fallo a mitad del intercambio
- **WHEN** la transacción de apply falla en cualquier punto
- **THEN** el plan padre conserva íntegros sus datos previos y el clon sigue existiendo

### Requirement: Cancelar la simulación no deja rastro
`DELETE /api/planning/simulation/:id` SHALL borrar el clon y todos sus hijos (datos y resultados) sin tocar el plan padre.

#### Scenario: Cancelar tras varios cambios
- **WHEN** se cancela una simulación con viajes y paradas modificados
- **THEN** el clon y sus hijos desaparecen y el plan real queda exactamente como estaba

### Requirement: Propiedad y recuperación de la simulación
Cada usuario SHALL tener como máximo una simulación abierta. Solo el propietario (o un superadmin) SHALL poder consultar el diff, aplicar o cancelar un clon. `GET /api/planning/simulation/mine` SHALL devolver la simulación abierta del usuario o `null`, permitiendo retomarla tras recargar la página.

#### Scenario: Retomar tras un refresh
- **WHEN** el usuario recarga la app con una simulación abierta
- **THEN** el frontend detecta la simulación vía `/mine` y ofrece retomarla o descartarla

#### Scenario: Clon ajeno
- **WHEN** un usuario no superadmin intenta aplicar el clon de otro usuario
- **THEN** el sistema responde 403/404 y no modifica nada

### Requirement: Limpieza de clones huérfanos
El sistema SHALL borrar automáticamente los planes `simulation` (con sus hijos) cuya antigüedad supere las 24 horas, ejecutando la limpieza al arrancar el backend y periódicamente.

#### Scenario: Clon abandonado
- **WHEN** un clon lleva más de 24 horas creado y corre la limpieza
- **THEN** el clon y sus hijos se borran; los clones más recientes permanecen

### Requirement: Señalización visual inequívoca en todas las vistas
Mientras `isSimulating` está activo, el frontend SHALL mostrar en todas las vistas (desde `Layout`): un aura roja difuminada alrededor del shell y un cartel fijo "MODO SIMULACIÓN — los cambios NO son reales" con la semana base ("Simulando sobre: Semana X") y los botones globales "Aplicar cambios" y "Cancelar simulación". "Aplicar cambios" SHALL mostrar el diff con confirmación explícita (y aviso destacado si `base_changed`) antes de ejecutar el apply.

#### Scenario: Navegación entre vistas en simulación
- **WHEN** el usuario simula y navega entre Dashboard, Secuenciación y Paradas
- **THEN** el aura y el cartel permanecen visibles en todas las vistas

#### Scenario: Aplicar con confirmación
- **WHEN** el usuario pulsa "Aplicar cambios"
- **THEN** se muestra el resumen del diff y el apply solo se ejecuta tras la confirmación explícita

### Requirement: Restricciones de edición durante la simulación
Durante la simulación el frontend SHALL: bloquear el selector de semana (mostrando la semana base), deshabilitar la edición de la configuración de Tolvas (es global, no clonable) con una nota explicativa, y deshabilitar la creación/borrado de lecturas de nivel (son hechos medidos que solo se arrastran del plan real). El botón "Simular cambios" SHALL mostrarse solo cuando el plan visible es el vigente o el próximo.

#### Scenario: Selector bloqueado
- **WHEN** el usuario está en simulación
- **THEN** no puede cambiar de semana hasta aplicar o cancelar

#### Scenario: Lecturas de nivel bloqueadas
- **WHEN** el usuario abre el Dashboard en simulación
- **THEN** los controles de añadir/borrar lectura de nivel están deshabilitados con una nota explicativa

#### Scenario: Semana pasada sin botón de simular
- **WHEN** el usuario navega a una semana del historial
- **THEN** el botón "Simular cambios" no está disponible

### Requirement: Compatibilidad del modelo de datos con un clon por semana
El sistema SHALL sustituir la restricción `UNIQUE(week_start)` por un índice único parcial que excluya `status = 'simulation'`, manteniendo la garantía de un único plan real por semana y permitiendo N clones sobre la misma semana. Las inserciones idempotentes existentes (`ON CONFLICT (week_start)`) SHALL seguir funcionando con el índice parcial.

#### Scenario: Clon y plan real conviven
- **WHEN** existe el plan real de una semana y se crea un clon de esa misma semana
- **THEN** ambos coexisten, y un intento de crear un segundo plan REAL para esa semana sigue siendo rechazado

#### Scenario: Rollover de semana con la restricción parcial
- **WHEN** arranca una semana nueva y `getActivePlanId()` materializa el plan vigente con `ON CONFLICT`
- **THEN** la operación sigue siendo idempotente bajo concurrencia (sin planes duplicados)
