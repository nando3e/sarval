# Bot Telegram (n8n) — tablas y uso

## Tablas

- **`proveedores`**: Catálogo de proveedores. Editable desde el frontend (menú Proveedores). El bot debe ofrecer solo los que tienen `activo = true`.
- **`telegram_drivers`**: Choferes identificados por Telegram. No están ligados a un proveedor (un día una ruta, otro día otra). Campos:
  - `telegram_id` (BIGINT, único): ID de usuario de Telegram.
  - `telefono` (opcional): teléfono del chofer.
  - `nombre_chofer`: nombre.

## Cómo aplicar el esquema

Ejecutar en tu base de datos (la que use el backend):

```bash
psql $DATABASE_URL -f backend/src/db/schema-telegram-drivers.sql
```

O desde tu cliente SQL: ejecutar el contenido de `backend/src/db/schema-telegram-drivers.sql`.

## Uso desde n8n

1. **Lista de proveedores para el bot**  
   GET `https://tu-api/api/proveedores?activo=true` (con cabecera `Authorization: Bearer <token>` si usas auth). Devuelve `[{ id, nombre, activo }, ...]`. Úsala cuando el flujo del bot necesite que el usuario elija un proveedor (por ejemplo para una ruta o entrega).

2. **Crear / actualizar chofer**  
   Desde n8n puedes conectar a la BD y hacer `INSERT`/`UPDATE` en `telegram_drivers`, o usar la API: GET/POST/PUT/DELETE `/api/telegram-drivers`. Los choferes solo tienen telegram_id, nombre_chofer y telefono (opcional); no hay relación con proveedores.

3. **Comprobar si el chofer existe**  
   `SELECT * FROM telegram_drivers WHERE telegram_id = $telegram_user_id`. Si no hay fila, es nuevo: pides nombre y teléfono (opcional) y lo das de alta.

## Consejos y posibles pegas

- **telegram_id**: Es un entero (a veces grande). En PostgreSQL está como `BIGINT`. En n8n, si recibes el ID como string, pásalo a número antes de guardar para evitar tipos distintos.
- **Desactivar proveedor**: En el frontend, "Desactivar" hace `activo = false` (no borra la fila). Si en el bot solo listas `activo = true`, los desactivados no salen en la lista.
- **Nombres repetidos**: No hay restricción única en el nombre del proveedor. Puedes tener varios "Proveedor A" (por ejemplo uno inactivo y uno nuevo). Si quieres evitar duplicados activos, puedes comprobarlo en el frontend o añadir un índice único parcial en (nombre) WHERE activo = true.
- **Token para n8n**: Si n8n llama a tu API (por ejemplo GET proveedores), necesitas autenticación. Opciones: usuario de aplicación + login para obtener JWT y usarlo en las peticiones, o un token fijo (API key) que expongas en un middleware y documentes en tu API.

## Resumen

- Tablas: `proveedores` (editable en frontend) y `telegram_drivers` (choferes sin relación con proveedores; API CRUD en el backend).
- El bot debe usar solo proveedores con `activo = true` cuando ofrezca lista de proveedores (p. ej. para una ruta).
