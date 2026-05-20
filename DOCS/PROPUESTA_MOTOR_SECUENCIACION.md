# SARVAL — Propuesta de mejoras del motor de secuenciación

> Documento de trabajo para validar con el cliente las reglas de negocio que debe seguir el motor de planificación.
>
> Está dividido en dos bloques: **(A) cómo modelar el tiempo físico de descarga y las bocas de la planta**, y **(B) qué reglas estrictas debe seguir el motor para proteger los viajes críticos sin dejar nunca el silo vacío**.

---

## Contexto: cómo funciona el motor hoy

El motor recorre la semana operativa en pasos de 30 minutos (Lunes 06:00 → Sábado 22:00) y, en cada paso, hace tres cosas:

1. Suma las toneladas de los camiones que llegan a esa hora.
2. Resta el consumo de la fábrica de ese tramo.
3. Decide qué camiones pueden descargar ahora y cuáles esperan.

Dentro de la cola de espera distingue **críticos** (prioritarios) y **no-críticos**. Hay una regla de "anticipación": antes de descargar un no-crítico el motor mira el siguiente crítico que va a llegar y, si descargar el no-crítico ahora dejaría sin hueco al crítico, retiene el no-crítico.

Este planteamiento funciona razonablemente, pero hace dos simplificaciones importantes que conviene revisar:

- **Trata las descargas como instantáneas**, ignorando que un camión tarda un rato en vaciarse y que durante ese tiempo la fábrica está consumiendo.
- **La regla de anticipación no contempla el riesgo de que, al retener un no-crítico, el silo se vacíe antes de que llegue el crítico.**

---

# Bloque A — Tiempo de descarga y bocas físicas

## A.1 Duración de descarga de un camión

### El problema

Hoy el motor asume que un camión vacía sus toneladas en el silo de forma instantánea. En la realidad, un camión tarda entre 15 y 45 minutos en descargar, y durante ese tiempo la fábrica sigue consumiendo materia prima. Eso significa que el camión que viene detrás encuentra **más hueco del que el plan calcula**.

Por eso a veces el motor marca "retraso por capacidad" donde en planta no se produce ningún retraso real.

### Pregunta para el cliente

> ¿Cómo modelamos el tiempo que tarda un camión en descargar?

**Opción A — Tiempo fijo igual para todos los camiones**
Por ejemplo: 30 minutos cualquier camión, sin importar las toneladas ni el proveedor.

- *Escenario*: llega MAFRICA con 18 t. Tardará 30 minutos. Llega FRIBIN con 5 t. También 30 minutos.
- *Ventaja*: muy sencillo de configurar. Una sola variable.
- *Desventaja*: si en realidad los camiones grandes tardan mucho más que los pequeños, este modelo no se ajusta y la planificación seguirá teniendo desviaciones.

**Opción B — Tiempo proporcional a las toneladas**
Por ejemplo: 1 minuto y medio por tonelada. Un camión de 10 t tarda 15 minutos, uno de 20 t tarda 30, uno de 25 t tarda 37 minutos.

- *Escenario*: si llega COSTA BRAVA con 25 t a las 12:00, terminará de descargar a las 12:37 aproximadamente.
- *Ventaja*: refleja bien la realidad para la mayoría de plantas (cuanto más vacía un camión, más tarda).
- *Desventaja*: requiere medir cuánto tiempo por tonelada se tarda realmente y configurarlo.

**Opción C — Tiempo distinto por proveedor**
Cada proveedor tiene un tiempo de descarga propio (porque su tipo de camión, sistema de descarga o protocolo es diferente).

- *Escenario*: SANTPERE descarga con bomba rápida → 12 minutos. FRIBIN tiene tolva propia más lenta → 35 minutos.
- *Ventaja*: la más fiel a la realidad.
- *Desventaja*: hay que mantener esa información en la ficha de cada proveedor y actualizarla si cambian de camión.

**Opción D — Mixta (tiempo mínimo + proporcional)**
Por ejemplo: 10 minutos fijos (entrada, papeleo, conexión) + 1 minuto por tonelada.

- *Escenario*: un camión de 5 t tarda 15 minutos, uno de 25 t tarda 35 minutos.
- *Ventaja*: refleja que aunque la carga sea pequeña hay un mínimo operativo.
- *Desventaja*: dos parámetros a calibrar en lugar de uno.

---

## A.2 Bocas de descarga

### El problema

El motor no contempla que físicamente solo cabe un número limitado de camiones descargando a la vez. Si llegan tres camiones a las 18:00, el motor los descarga como si tuviera tres bocas funcionando en paralelo.

### Respuesta confirmada por el cliente

> **Una boca por tolva.**

Esto significa que los camiones se descargan **uno detrás de otro**, no en paralelo. Si llegan tres a la misma hora, el primero entra, los otros dos esperan en planta a que termine.

Esto se traducirá en un nuevo tipo de retraso que aparecerá en la planificación: **"esperando a que se libere la boca"**, distinto del retraso por capacidad del silo. Lo señalaremos en la tabla de secuenciación con un código de color propio para que se distinga del retraso por silo lleno.

---

## A.3 Tiempo muerto entre camiones

### El problema

Entre que un camión termina de descargar y el siguiente empieza, suele haber un pequeño margen: el primero tiene que retirarse, el segundo posicionarse, conectar mangueras o pesar.

### Pregunta para el cliente

> ¿Hay un tiempo muerto entre camiones que debamos incluir en el modelo? Si lo hay, ¿de cuántos minutos?

- *Si la respuesta es **5 minutos***: con un camión que descarga de 18:00 a 18:30, el siguiente no podrá empezar hasta las 18:35.
- *Si la respuesta es **0 minutos***: en cuanto sale uno, entra el siguiente.

La elección afecta a cuántos camiones pueden encadenarse en una franja apretada (por ejemplo, 4 camiones críticos seguidos por la mañana).

---

## A.4 Boxes — ¿ocupan boca o son independientes?

### El problema

Los **boxes** (entradas graduales de material) hoy se modelan como un goteo paralelo: no ocupan boca de descarga ni interfieren con los camiones. Conviene confirmar si en la realidad funciona así.

### Pregunta para el cliente

> ¿Los boxes utilizan la misma boca que los camiones, o tienen entrada independiente?

**Opción A — Boca independiente**
Los boxes entran por una vía paralela que no estorba a los camiones. Modelo actual.

**Opción B — Misma boca**
Mientras hay un box descargando, no puede entrar ningún camión, y viceversa. Esto generaría un nuevo tipo de retención: "camión esperando a que termine el box".

---

## A.5 Visualización en el Dashboard

### El problema

Si modelamos la descarga como un proceso gradual (no instantáneo), la curva de nivel del silo en el gráfico cambia: en lugar de un salto vertical cuando entra un camión, será una rampa que sube durante los minutos que dura la descarga.

### Pregunta para el cliente

> ¿Queremos mostrar las descargas como rampas graduales en el gráfico del Dashboard, o seguir mostrándolas como saltos instantáneos aunque por dentro el motor las calcule gradualmente?

- **Rampa gradual**: más fiel, más fácil leer "qué pasa en cada momento exacto". Más información visual.
- **Salto instantáneo**: gráfico más limpio, pero esconde lo que realmente está pasando dentro de cada paso.

---

# Bloque B — Reglas estrictas para proteger críticos y stock

## B.1 La pregunta de fondo: ¿qué es peor, parar la planta o retrasar un crítico?

### El dilema

El motor tiene que tomar decisiones en tiempo real entre dos cosas malas:

- **Si retiene a un no-crítico** para reservar hueco a un crítico futuro → corre el riesgo de que el silo se vacíe entre medias y la planta pare.
- **Si deja descargar al no-crítico** → corre el riesgo de que cuando llegue el crítico no quepa y tenga que esperar.

Hoy el motor intenta proteger al crítico siempre que puede, pero sin pensar explícitamente en el suelo de stock. Tu intuición es correcta: si el silo está a 18 t a las 15:00 y retenemos un no-crítico de 20 t para que un crítico encuentre hueco a las 18:00, **el silo se queda a 0 antes de que llegue el crítico** y la planta para.

Eso es un mal trato: paramos la planta 30 minutos para ahorrarle 30 minutos de espera a un crítico.

### Pregunta para el cliente

> Si hay que elegir entre que el crítico espere o que la planta pare, ¿qué prefieres?

**Opción A — La planta nunca debe parar**
Si el silo está en riesgo de vaciarse, dejamos descargar a los no-críticos aunque eso obligue a un crítico a esperar después.

- *Escenario*: viernes 15:00, silo a 14 t, queda un no-crítico de 16 t y un crítico de 20 t a las 18:00.
- *Decisión*: dejamos pasar al no-crítico → silo sube a 30 t, no para. Crítico llega a las 18:00, el silo está a 12 t (30 − 18 de consumo), hueco 28. **Cabe sin esperar**. Resultado: ningún problema.
- *Pero si el escenario fuera peor*: si los 16 t del no-crítico no llegasen y el silo se quedase a 0 antes de las 18:00, asumimos que el crítico esperará a vaciarse el silo y será él quien rellene.

**Opción B — Al crítico no se le hace esperar**
Se prioriza la espera del crítico por encima de mantener el silo con stock.

- *Escenario*: el motor retiene el no-crítico aunque eso lleve a la planta a parar 30 minutos.
- *Cuándo aplica*: clientes con compromisos contractuales muy estrictos con ciertos proveedores. Raro en este sector.

**Opción C — Depende del tiempo de espera evitado**
"Solo aceptamos parar la planta X minutos si así evitamos que el crítico espere Y minutos."

- *Escenario*: aceptamos parar máximo 15 minutos para evitar una espera del crítico de hasta 60 minutos. Si la espera del crítico iba a ser solo de 30 minutos, no merece la pena.
- *Ventaja*: política más fina.
- *Desventaja*: hay que definir el umbral exacto.

**Recomendación**: Opción A. La parada de planta tiene coste directo (mano de obra ociosa, posibles incidencias de calidad) que casi siempre supera al coste de un crítico esperando media hora.

---

## B.2 Nivel mínimo de seguridad del silo

### El problema

Hoy el motor no tiene noción de un "suelo" por debajo del cual no debería bajar. Trata el silo a 30 t igual que a 3 t mientras no llegue a 0. Para aplicar las reglas anteriores (no parar la planta), necesitamos definir cuándo se considera que el silo está en zona de riesgo.

### Pregunta para el cliente

> ¿Por debajo de cuántas toneladas (o cuántas horas de consumo) consideramos que el silo está en zona crítica y no se debe retener ningún viaje?

**Opción A — En toneladas absolutas**
Por ejemplo, "nunca por debajo de 10 t".

- *Escenario*: silo a 12 t, no-crítico de 8 t esperando. Por debajo del umbral (10 t) está prohibido retener → el motor lo deja pasar aunque eso perjudique a un crítico futuro.

**Opción B — En horas de consumo**
Por ejemplo, "nunca menos de 2 horas de margen". Con un consumo de 12 t/h, eso equivale a 24 t.

- *Ventaja*: si el consumo cambia (cambio de receta, parada parcial), el umbral se adapta automáticamente.
- *Desventaja*: requiere explicar a los operarios el concepto.

**Opción C — Sin nivel mínimo definido**
Mantener la lógica actual: el motor no toma decisiones extras basadas en el nivel.

- *Desventaja*: persiste el riesgo del ejemplo del 15:00 → 18:00.

**Recomendación**: Opción B con valor inicial de 2 horas de consumo. Es un margen razonable que cubre imprevistos sin ser demasiado conservador.

---

## B.3 Ventana temporal de protección de críticos

### El problema

Hoy el motor protege al crítico independientemente de lo lejos que esté en el tiempo. Eso quiere decir que, en teoría, podría retener un no-crítico el lunes por la mañana para "reservar hueco" a un crítico del jueves. Eso no tiene sentido porque entre medias habrá muchas otras descargas y consumo.

### Pregunta para el cliente

> ¿Cuál es el horizonte temporal máximo dentro del cual tiene sentido reservar hueco para un crítico que aún no ha llegado?

**Opción A — 1 hora**
Muy estricto: el motor casi nunca retiene. Solo si el crítico está literalmente a la vuelta de la esquina.

- *Escenario*: a las 17:00 ya empieza a proteger al crítico de las 18:00. Antes, lo deja descargar todo.
- *Riesgo*: críticos que requieren más anticipación pueden quedar fuera.

**Opción B — 2 horas**
Equilibrado. La mayoría de los críticos se protegen con holgura suficiente, sin retener material innecesariamente.

- *Escenario*: a las 16:00 ya estaría considerando el crítico de las 18:00. Antes, los no-críticos descargan sin restricciones.

**Opción C — 3 horas**
Conservador. Para plantas donde los críticos son muy grandes y necesitan mucha planificación.

- *Escenario*: a las 15:00 ya se contempla el crítico de las 18:00. Mayor riesgo de retenciones innecesarias.

**Opción D — Sin ventana (toda la semana)**
La lógica actual.

- *Riesgo*: retenciones innecesarias por críticos lejanos.

**Recomendación**: Opción B (2 horas). Cubre la inmensa mayoría de casos sin generar retenciones espurias.

---

## B.4 Críticos simultáneos: orden de prioridad

### El problema

Cuando llegan dos críticos a la misma hora y entre los dos no caben en el silo, hoy el motor procesa al primero que aparece en la base de datos (por número de ID). El segundo se queda esperando, aunque hubiera sido más eficiente al revés.

### Pregunta para el cliente

> Si llegan dos críticos a la misma hora y no caben ambos, ¿en qué orden los procesamos?

**Opción A — Primero el más pequeño**
Asegura que al menos uno entra completo. El grande espera.

- *Escenario real (caso #36 de la Semana 10)*: a las 18:00 llegan #35 (10 t) y #36 (25 t). Silo con 33 t de hueco.
- *Con esta regla*: #35 entra (10 t), quedan 23 de hueco. #36 (25 t) **no cabe → espera**. Es lo que pasa hoy.

**Opción B — Primero el más grande**
Da prioridad al crítico que más difícil tendrá encontrar hueco después.

- *Escenario mismo caso*: #36 entra primero (25 t), quedan 8 de hueco. #35 (10 t) **no cabe → espera 30 min**.
- *Ventaja*: al grande no se le hace esperar y, normalmente, el pequeño cabe enseguida porque hace falta menos hueco para encajarlo.

**Opción C — Por orden de proveedor o importancia comercial**
Si hay proveedores que el cliente considera más prioritarios que otros, podemos respetar ese orden.

**Recomendación**: Opción B. En el caso #36 de la semana pasada, esta regla habría reducido la espera total entre los dos críticos.

---

## B.5 Evaluación de no-críticos: ¿uno a uno o en conjunto?

### El problema

Hoy el motor decide sobre los no-críticos **de uno en uno**. Cada uno se evalúa independientemente: "¿este individualmente bloquearía al crítico?". Pero puede ocurrir que ninguno individualmente lo bloquee y los tres juntos sí.

### Pregunta para el cliente

> Cuando hay varios no-críticos en cola, ¿queremos que el motor los evalúe individualmente (rápido, menos conservador) o en conjunto (más fiel, más conservador)?

**Opción A — Individual** (lógica actual)
Cada no-crítico se evalúa por separado.

- *Escenario*: tres no-críticos de 8 t cada uno. El motor mira el primero: "¿me bloquea al crítico si descargo 8 t?". Si no, lo descarga. Luego mira el segundo con el nuevo nivel. Y luego el tercero.
- *Problema*: puede acumularse demasiada carga sin que ningún paso individual dispare la alerta.

**Opción B — Acumulada**
El motor simula descargar todos los no-críticos pendientes y mira si el crítico cabría.

- *Escenario mismo caso*: el motor mira "si descargo los tres (24 t en total), ¿le queda hueco al crítico?". Si no, retiene desde el primero.
- *Ventaja*: más fiel a la realidad.
- *Desventaja*: más restrictivo, puede retener no-críticos en casos donde individualmente no hacía falta.

**Recomendación**: Opción B, sobre todo si elegimos Opción A en B.1 (planta nunca para). Las dos reglas juntas (suelo mínimo + evaluación acumulada) dan la mejor garantía.

---

## B.6 Avisos cuando se prevé parada inevitable

### El problema

A pesar de aplicar todas las reglas anteriores, puede haber semanas donde, con los viajes planificados y el consumo previsto, el silo va a llegar a 0 sí o sí. Hoy el motor lo calcula y lo muestra en el gráfico, pero no hay una alerta clara que diga "ojo, vas a parar el martes a las 11:00".

### Pregunta para el cliente

> ¿Cómo quieres que la app avise cuando detecta que la planta va a parar?

**Opción A — Alerta visual en la app**
Banner rojo en el Dashboard cuando se detecta parada inminente o futura. Hoy ya parcialmente implementado.

**Opción B — Webhook a n8n / Telegram**
Cuando el motor detecta una parada prevista, lanza un mensaje automático al canal de Telegram del responsable.

- *Ejemplo*: "Aviso: previsto silo a 0 el martes a las 11:00. Considera adelantar un viaje de FRIBIN."

**Opción C — Sugerencia automática de viaje extra**
El motor calcula cuánto material falta y a qué hora habría que añadirlo para evitar la parada. Muestra esa sugerencia al usuario.

- *Ejemplo*: "Para evitar la parada del martes, añade un viaje extra de mínimo 15 t antes de las 10:30."

**Opción D — Combinación de las tres**
Lo más completo: alerta en la app + aviso por Telegram + sugerencia concreta de qué hacer.

**Recomendación**: Opción D. La sugerencia automática es la que más valor aporta porque no solo informa del problema, sino que orienta la solución.

---

# Resumen de decisiones pendientes

| # | Pregunta | Estado |
|---|----------|--------|
| A.1 | Modelo de duración de descarga (fija / por toneladas / por proveedor / mixta) | Pendiente |
| A.2 | Número de bocas por tolva | ✅ **Confirmado: 1 boca por tolva** |
| A.3 | Tiempo muerto entre camiones (¿cuántos minutos?) | Pendiente |
| A.4 | Boxes — ¿comparten boca con los camiones? | Pendiente |
| A.5 | Visualización: rampa gradual o salto instantáneo en el gráfico | Pendiente |
| B.1 | Prioridad: nunca parar la planta vs nunca hacer esperar al crítico | Pendiente |
| B.2 | Nivel mínimo de seguridad del silo (en toneladas u horas de consumo) | Pendiente |
| B.3 | Ventana temporal de protección de críticos | Pendiente |
| B.4 | Orden entre críticos simultáneos | Pendiente |
| B.5 | Evaluación de no-críticos: individual o acumulada | Pendiente |
| B.6 | Forma de aviso ante parada prevista | Pendiente |

---

**Próximo paso**: presentar este documento al cliente y recoger sus respuestas. Una vez tengamos las decisiones, se ajusta el motor y se valida con un caso real de planificación.
