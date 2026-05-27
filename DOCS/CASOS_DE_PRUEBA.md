# SARVAL — Casos de prueba (checklist de validación final)

> Lista viva. Marcar cada caso cuando se valide. Probar idealmente con datos reales de una semana representativa y con **2 tolvas** activas para cubrir el modo multi-tolva.

## 0. Convenciones
- "Recalcular" = el resultado (gráfico de nivel + tabla de Secuenciación) refleja el cambio.
- Anotar en cada caso si el recálculo fue **automático** o requirió pulsar **Actualizar** (ver objetivo de estandarización en PLAN/notas).

---

## 1. Autenticación y navegación
- [ ] Login con usuario/clave correctos entra; incorrectos da error.
- [ ] Token caducado/ausente redirige a login.
- [ ] El selector de semana cambia vigente / próxima / pasadas y todas las vistas reaccionan.

## 2. Subida de planificación (CSV / Excel)
- [ ] Sube CSV con cabecera correcta: importa todos los viajes.
- [ ] Sube Excel (.xlsx) con las mismas columnas.
- [ ] **Nº viaje (matrícula) obligatorio**: fila sin matrícula → error en esa fila.
- [ ] **Matrícula duplicada dentro del archivo** → error.
- [ ] **Matrícula duplicada contra un extra ya existente** → error de unicidad (índice plan_id+trip_number).
- [ ] Matrícula alfanumérica (ej. `V-2026-0001`) se acepta y se muestra tal cual.
- [ ] **Producto obligatorio**: fila sin producto → error.
- [ ] **Tolva por nombre**: la columna Tolva usa el nombre exacto de la tolva; asigna bien.
- [ ] Tolva inexistente o vacía → cae a la tolva por defecto (1 sola tolva) o error (multi-tolva, si se decide obligatoria).
- [ ] Día/hora/toneladas inválidos → error en esa fila, el resto importa.
- [ ] Volver a subir reemplaza los viajes base y **mantiene** los extras.

## 3. Viajes extras
- [ ] Crear extra con matrícula + producto + tolva → aparece en listado y en Secuenciación.
- [ ] Matrícula vacía o duplicada en la semana → error 409.
- [ ] Producto vacío → error.
- [ ] La fecha se muestra junto al día ("Lunes 23 nov").

## 4. Secuenciación
- [ ] Críticos se muestran con chip verde "Sí".
- [ ] Filas con retraso por capacidad en rojo; retenidas por crítico en amarillo.
- [ ] El hover no borra el color de la fila.
- [ ] **Retraso (h) con 2 decimales** (paso 15 min → 0.25, 0.50…).
- [ ] **Nivel previo (tn)**: coincide con el nivel del silo justo antes de la hora prevista del viaje (incluye efecto de boxes).
- [ ] **Editar inline**: cambia día/hora/proveedor/producto/ton/crítico/retraso/nueva hora/estado y guarda → se refleja.
- [ ] Fila en edición resaltada y columna Acciones fija (sticky) al hacer scroll horizontal.
- [ ] **Desviar** a otra tolva (multi-tolva) recalcula ambas tolvas.
- [ ] **Selector de columnas**: ocultar/mostrar persiste al recargar (localStorage).
- [ ] Botón Actualizar recalcula.

## 5. Motor de simulación (lógica de negocio)
- [ ] Críticos descargan antes que no-críticos cuando compiten por hueco.
- [ ] **Retención por crítico**: un no-crítico que cabría se retiene si dejaría sin hueco a un crítico próximo; se marca y se ve el efecto.
- [ ] **Retraso por capacidad**: un viaje que llega y no cabe espera y su hora final se retrasa.
- [ ] **Críticos simultáneos** que no caben los dos: el segundo espera (revisar orden — decisión cliente pendiente).
- [ ] **Paradas pausan TODA actividad**: durante una parada no hay consumo, ni descargas de camión, ni entrada de boxes.
- [ ] **Boxes se posponen** durante una parada (no gotean) y entregan el total después.
- [ ] **Lectura de nivel reancla**: tras una lectura, el nivel en ese instante = el medido, y la curva + secuencia se recalculan de ahí en adelante; el pasado no cambia.
- [ ] **Productividad variable**: una franja con caudal distinto cambia el consumo en su tramo y vuelve al base fuera de ella.
- [ ] **Productividad no toca el pasado** (semana vigente): franja ya empezada bloqueada; añadir una nueva desde "ahora" solo afecta al futuro.
- [ ] Semana operativa Lunes 06:00 → Sábado 22:00 (consumo continuo incluidas las noches).

## 6. Dashboard / gráfico
- [ ] Curva de nivel en **dientes de sierra**: el salto vertical mide exactamente las toneladas descargadas.
- [ ] **Eje Y sin decimales raros** (números redondeados) en ambos paneles.
- [ ] Panel de flujos con **escala fija ±capacidad** de la tolva (no auto-escala).
- [ ] Tooltip de flujos muestra **cada viaje con su matrícula y tn**; críticos con etiqueta **CR**; sin matrícula → `[indefinido]`.
- [ ] Marcador morado de **lectura de nivel** en su punto + leyenda.
- [ ] Banda gris en **paradas**.
- [ ] KPIs (horas paradas, stock mínimo, viajes, con retraso) cuadran con la simulación.
- [ ] Multi-tolva: vista general muestra tarjetas por tolva sin gráfico ambiguo; al entrar en una tolva, gráfico + botón "← Todas las tolvas".

## 7. Tolvas
- [ ] Crear/editar tolva (capacidad, consumo base, nivel inicial, paso, nivel alerta).
- [ ] Cambiar capacidad o consumo base → la simulación lo refleja al recalcular.
- [ ] Nombre de tolva único (si se decide aplicar restricción).

## 8. Paradas
- [ ] Crear/editar/borrar parada.
- [ ] La parada se ve como banda en el gráfico y pausa la actividad.

## 9. Boxes
- [ ] Crear box (tons totales + periodo) → entra gradualmente y sube el nivel.
- [ ] Box durante parada → se pospone.

## 10. Productividad (vista nueva)
- [ ] Caudal base mostrado correctamente (= consumo de la tolva).
- [ ] Crear franja → calendario la pinta en verde con su t/h por hora.
- [ ] **Solapamiento**: la franja más reciente pisa a la anterior en el tramo común (verificable en los números por hora).
- [ ] Tramos sin franja → gris suave "base"; fuera de operación → rayado.
- [ ] Líneas verticales por hora + marcador rojo "ahora" en el día actual.
- [ ] **Semana vigente**: franja ya empezada bloqueada (🔒); crear en el pasado → rechazado.
- [ ] **Semana pasada**: vista solo lectura.

## 11. Multi-tolva (transversal)
- [ ] Filtros por tolva en Planificación / Secuenciación / Paradas / Boxes / Productividad.
- [ ] Desviar viaje entre tolvas recalcula las dos.
- [ ] Cada tolva respeta sus propios parámetros (capacidad, consumo, paso).

## 12. Estandarización del recálculo (objetivo)
- [ ] Toda acción que altere la simulación recalcula automáticamente (upload, extra, editar/borrar viaje, desviar, parada, box, lectura, productividad, parámetros de tolva).
- [ ] El botón "Actualizar" queda como recálculo manual de respaldo.
- [ ] Decidir comportamiento de webhooks en recálculos automáticos (silencio vs aviso).

## 13. Integración n8n / webhooks (FASE 2, cuando aplique)
- [ ] Eventos se emiten a las URLs configuradas.
- [ ] Endpoint de identificación de viaje (matrícula, o proveedor+producto+fecha) devuelve el viaje correcto.
- [ ] Asociación de teléfono/telegram_id al viaje.
