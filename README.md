# SARVAL - Planificador de Descargas

App web (React + Node) para planificación de descargas en silo. Incluye Docker Compose con PostgreSQL y está lista para desplegar en **Dokploy**.

## Requisitos

- **Desarrollo:** Node.js 18+, PostgreSQL
- **Producción:** Docker y Docker Compose (o Dokploy)

## Variables de entorno

Copia `.env.example` a `.env` en la **raíz del proyecto** y ajusta:

| Variable | Descripción | Por defecto (Docker) |
|----------|-------------|----------------------|
| `POSTGRES_USER` | Usuario de PostgreSQL | `sarval` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL | `sarval_secret` |
| `POSTGRES_DB` | Nombre de la base | `sarval` |
| `DATABASE_URL` | URL de conexión (con compose: `postgres://sarval:sarval_secret@postgres:5432/sarval`) | ver .env.example |
| `SUPERADMIN_USER` | Usuario del superadmin (login) | `admin` |
| `SUPERADMIN_PASSWORD` | Contraseña del superadmin | Cambiar en producción |
| `JWT_SECRET` | Clave para firmar tokens JWT | Cambiar en producción |
| `JWT_EXPIRES_IN` | Caducidad del token | `7d` |

## Desarrollo local

```bash
# Backend
cd backend
cp .env.example .env
# Editar .env con DATABASE_URL y SUPERADMIN_*
npm install
npm run dev

# Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

- **API:** http://localhost:4000  
- **App:** http://localhost:3000 (Vite redirige `/api` al backend)

**Login:** `SUPERADMIN_USER` / `SUPERADMIN_PASSWORD` (por defecto `admin` y el valor de tu `.env`).

## Docker (local)

En la raíz del proyecto:

```bash
cp .env.example .env
# Opcional: editar .env (contraseñas, JWT_SECRET, etc.)
docker compose up --build
```

- **App y API:** Docker asigna puertos libres en el host. Tras `docker compose up`, ejecuta `docker compose ps` para ver las URLs (ej. `0.0.0.0:32768->80/tcp` para el frontend). En **Dokploy** la URL suele mostrarse en el panel de la aplicación.

El Compose levanta **PostgreSQL**, backend y frontend. Los datos de Postgres se persisten en el volumen `postgres_data`. Al no fijar puertos en el host se evitan errores tipo "port is already allocated".

### Usar una base de datos Postgres externa (ya poblada)

Si quieres conectar a un Postgres que ya tienes (por ejemplo para test con datos existentes), basta con definir **solo** `DATABASE_URL` con la URL de esa base:

- **Con el compose normal:** pon en `.env` (o en las variables de Dokploy) tu URL, por ejemplo  
  `DATABASE_URL=postgres://usuario:password@host:puerto/nombre_base`  
  El backend usará esa base. El contenedor `postgres` del compose seguirá arrancando pero no se usará.

- **Sin levantar Postgres del compose:** usa el compose alternativo que no incluye Postgres:
  ```bash
  docker compose -f docker-compose.external-db.yml up --build
  ```
  En Dokploy: en “Compose file” indica `docker-compose.external-db.yml` y define solo `DATABASE_URL` (y el resto de variables del backend).

## Despliegue en Dokploy

1. **Crea el repositorio en GitHub** (si aún no está subido):
   - Crea un repo nuevo en GitHub (ej. `tu-usuario/sarval`).
   - En la carpeta del proyecto:
     ```bash
     git init
     git add .
     git commit -m "Initial commit - SARVAL listo para Dokploy"
     git branch -M main
     git remote add origin https://github.com/TU_USUARIO/sarval.git
     git push -u origin main
     ```

2. **En Dokploy:**
   - Nueva aplicación → **Docker Compose** (o “Compose”).
   - Conecta el repositorio de GitHub (URL del repo o integración GitHub).
   - Directorio del Compose: raíz del repo (donde está `docker-compose.yml`).
   - **Variables de entorno:** en la configuración del proyecto/compose, añade las variables de `.env` (o pega el contenido de `.env` que uses). Mínimo recomendado:
     - `POSTGRES_PASSWORD` (y si cambias usuario/DB: `POSTGRES_USER`, `POSTGRES_DB`)
     - `DATABASE_URL` acorde (ej. `postgres://sarval:TU_PASSWORD@postgres:5432/sarval`)
     - `SUPERADMIN_USER`, `SUPERADMIN_PASSWORD`
     - `JWT_SECRET` (valor seguro en producción)
   - Guarda y despliega. Dokploy ejecutará `docker compose up` con tu `docker-compose.yml`.

3. **Puertos:** El frontend queda en el puerto que Dokploy asigne (ej. 3000). La API en 4000. Configura dominio/reverso si lo necesitas.

4. **Base de datos externa (test o Postgres ya poblado):** Define `DATABASE_URL` con la URL de tu Postgres. Para no levantar el Postgres del compose, en Dokploy usa como archivo de Compose: `docker-compose.external-db.yml`.

5. **Warnings en Dokploy:** Si ves "variable is not set" para `POSTGRES_USER` u otras, define esas variables en la configuración de la app (aunque tengan valor por defecto en el compose). La variable con nombre largo tipo `JJGHRRHFIH...` la inyecta Dokploy; puedes ignorarla o dejarla en blanco.

## Estructura del proyecto

- `backend/`: API Express (auth JWT, planificación, viajes, dashboard, parámetros, etc.).
- `frontend/`: React (Vite), login, Dashboard, Planificación, Secuenciación, Choferes, Proveedores, Viajes extras, Configuración.
- `docker-compose.yml`: Postgres + backend + frontend, listo para Dokploy.

## Licencia

Uso interno / según tu organización.
