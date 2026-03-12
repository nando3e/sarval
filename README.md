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

- **App:** http://localhost:3000  
- **API directa:** http://localhost:4000  

El Compose levanta **PostgreSQL**, backend y frontend. Los datos de Postgres se persisten en el volumen `postgres_data`.

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

4. **Base de datos externa (opcional):** Si en Dokploy usas un Postgres gestionado por otro servicio, deja de usar el servicio `postgres` del compose (comenta el servicio y el `depends_on` de `backend` a `postgres`) y define solo `DATABASE_URL` apuntando a ese servidor.

## Estructura del proyecto

- `backend/`: API Express (auth JWT, planificación, viajes, dashboard, parámetros, etc.).
- `frontend/`: React (Vite), login, Dashboard, Planificación, Secuenciación, Choferes, Proveedores, Viajes extras, Configuración.
- `docker-compose.yml`: Postgres + backend + frontend, listo para Dokploy.

## Licencia

Uso interno / según tu organización.
