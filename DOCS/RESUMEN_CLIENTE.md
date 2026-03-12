# SARVAL - Resumen para el cliente

---

## Ahora hacéis esto:

- Tenéis un **Excel con un script** que gestiona la planificación semanal de descargas de camiones en un silo.

- Cada semana, alguien rellena la **Planificación Base**: 77 viajes con su día (lunes a sábado), hora, proveedor, toneladas y si es crítico o no.

- Durante la semana, cuando surge un **viaje extra** no planificado, alguien lo añade a mano en la pestaña "Viajes Extras".

- Cuando un camionero avisa de que trae **más o menos kilos**, o que llega **a otra hora**, o **otro día**, alguien edita directamente la celda correspondiente en la Planificación Base.

- Si se **cancela un viaje**, se borra la fila a mano.

- Después de cualquier cambio, alguien pulsa el botón **"ACTUALIZAR"** y el script recalcula todo:
  - La **Secuenciación**: cada camión con su hora real de descarga y cuánto retraso tiene por falta de espacio en el silo. Si el silo está lleno, el camión espera. Los críticos tienen prioridad.
  - La **Simulación del Silo**: paso a paso cada 30 minutos de toda la semana, mostrando el nivel del silo, cuántas toneladas entran, cuántas se consumen, y si hay parada de producción por silo vacío.
  - El **Dashboard**: resumen visual con los parámetros del silo y un gráfico del nivel.

- Actualmente hay **3 columnas vacías** en la Secuenciación (Retraso llegada, Nueva hora, Estado) que nadie rellena porque no hay un sistema para hacerlo. Están ahí para el futuro.

- Todo este proceso depende de que una **persona** reciba las llamadas o mensajes de los camioneros, entienda qué ha cambiado, lo escriba en el Excel, y pulse el botón. Si esa persona no está disponible, el sistema no se actualiza.

---

## Vamos a hacer esto:

- Crear una **app web** que replique exactamente lo que hace el Excel: misma lógica, mismo motor de simulación, mismos resultados. La persona que hoy usa el Excel podrá hacer lo mismo desde el navegador, desde cualquier sitio.

- La app tendrá **login** para controlar quién accede.

- Se podrá **subir la planificación semanal** en formato CSV o Excel, igual que ahora se rellena la pestaña base.

- Habrá una sección para **añadir viajes extras** y otra para **editar cualquier viaje** (cambiar kilos, hora, día, crítico, cancelar...) directamente desde la web.

- El botón **"ACTUALIZAR"** seguirá existiendo: un solo clic y el motor recalcula toda la secuenciación y la simulación del silo.

- El **Dashboard** será interactivo: gráfico del nivel del silo navegable, tarjetas con horas de parada, stock mínimo, y resaltado de viajes con retraso o que se han desplazado a otro día.

- Las **3 columnas que hoy están vacías** (retraso de llegada, nueva hora, estado) las rellenará el sistema de forma automática a partir de la información que envíen los camioneros.

- Prepararemos la app para conectarla a un **bot de WhatsApp/Telegram** (vía n8n) que hará el trabajo de la persona:
  - Cada mañana, el bot preguntará a cada camionero: *"Hola, esperamos que llegues hoy con el viaje #XX, XX toneladas a las XX:XX. ¿Confirmas o hay algún cambio?"*
  - El camionero responde directamente por mensaje: confirma, dice que trae más kilos, que llega tarde, o que tiene un viaje extra.
  - El bot interpreta el mensaje, actualiza los datos en la app y lanza el recálculo automáticamente.
  - Si el recálculo detecta retrasos nuevos, el bot avisa a los camioneros afectados: *"Tu descarga se retrasará aproximadamente X horas por falta de espacio en el silo."*

- El resultado: **la planificación se actualiza en tiempo real sin que nadie tenga que estar pendiente del Excel**. La persona responsable solo tiene que mirar el dashboard para ver cómo va la semana.

---

## En resumen:

**Hoy** → Una persona recibe info por teléfono, edita un Excel y pulsa un botón.

**Mañana** → Los camioneros hablan directamente con un bot, y la app se actualiza sola. La persona solo supervisa.
