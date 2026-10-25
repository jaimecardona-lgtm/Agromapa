# AgroMapa Colombia

AgroMapa Colombia es una plataforma de mapeo digital agroproductivo y ambiental orientada a visualizar la producción agrícola de Colombia desde una escala nacional hasta niveles específicos como departamentos, municipios, veredas, fincas y lotes productivos.

El proyecto permite caracterizar productores rurales, registrar cultivos, cantidades disponibles, temporadas de cosecha y ubicación geográfica, con el objetivo de conectar la oferta agrícola local con compradores como restaurantes, plazas de mercado, comerciantes, distribuidores y organizaciones interesadas en adquirir materia prima directamente desde el territorio.

La solución combina un frontend modular en React, un backend en FastAPI, una base de datos en Supabase/PostgreSQL, visualización geoespacial, analítica productiva, datos públicos agroambientales, RAG e inteligencia artificial para apoyar la toma de decisiones, fortalecer el mercado rural y construir un ambiente virtual del agro colombiano.

## Tecnología

| Capa | Stack | Versión |
|------|-------|---------|
| Frontend | React + Vite + TypeScript | 18.3 / 5.3 / 5.4 |
| Backend | FastAPI + Python | 0.104 / 3.11 |
| Database | Supabase PostgreSQL + PostGIS | 15 |
| CI/CD | GitHub Actions | - |

## Requisitos Previos

- **Node.js** 20+
- **Python** 3.11+
- **Docker & Docker Compose** (opcional, para desarrollo local)
- Cuenta de **Supabase** (para producción)

## Instalación Rápida

### 1. Clonar el repositorio
```bash
git clone https://github.com/agromapa/agromapa-colombia.git
cd agromapa-colombia
```

### 2. Frontend Setup

```bash
cd frontend

# Instalar dependencias
npm install

# Crear archivo .env local (basado en .env.example)
cp .env.example .env.local
# Editar .env.local si es necesario

# Ejecutar desarrollo
npm run dev
# Frontend disponible en http://localhost:5173
```

### 3. Backend Setup

```bash
cd backend

# Crear ambiente virtual
python -m venv venv

# Activar ambiente (Windows: venv\Scripts\activate, Unix: source venv/bin/activate)
source venv/bin/activate  # o venv\Scripts\activate en Windows

# Instalar dependencias
pip install -r requirements.txt

# Crear archivo .env local (el backend lee .env, no .env.local)
cp .env.example .env
# Editar .env con tus credenciales

# Ejecutar servidor
python -m uvicorn app.main:app --reload
# Backend disponible en http://localhost:8000
```

## Variables de Entorno

### Frontend (`.env.local`)
```
VITE_API_BASE_URL=http://localhost:8000
```

### Backend (`.env`)
```
APP_ENV=development
APP_DEBUG=true
API_V1_PREFIX=/api
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-secret-key
# Opcional: agente IA
OPENROUTER_ENABLED=false
OPENROUTER_API_KEY=your-openrouter-key
# Opcional: imágenes IA (vacío = deshabilitadas)
IMAGE_GENERATION_PROVIDER=
IMAGE_STORAGE_BUCKET=crop-illustrations
```

## Desarrollo local vs Docker Compose

**Desarrollo local (recomendado para programar):** backend con `uvicorn` y frontend con `npm run dev`, como se describe arriba.

**Docker Compose (production-like):** levanta los artefactos finales: la imagen del backend (uvicorn sin `--reload`) y el build estático del frontend servido con `serve` en modo SPA. No usa Vite dev server.

- **Supabase es externo.** Compose NO crea PostgreSQL local. La base de datos es el proyecto de Supabase configurado en `backend/.env`.
- **Migraciones manuales.** Las migraciones de `supabase/migrations/` se aplican a mano en Supabase, en orden (001 a 015). Ver estado abajo.
- **Secretos:** `backend/.env` (opcional) se carga en el backend en tiempo de ejecución y no se copia a la imagen. El frontend solo recibe `VITE_*` (públicas) como argumentos de build.

```bash
# Variables del frontend (build) y de Compose: archivo .env en la raíz (opcional)
#   VITE_API_BASE_URL=http://localhost:8000
#   VITE_SUPABASE_URL=...        (URL pública de Supabase)
#   VITE_SUPABASE_ANON_KEY=...   (clave anon pública)

docker compose build
docker compose up -d

# Frontend: http://localhost:5173
# Backend:  http://localhost:8000/api/health
```

**Estado de migraciones:** 009 a 013 aplicadas. **014 (imágenes ilustrativas) pendiente y opcional.** **015 (seguridad del RPC geo) pendiente de aplicación manual.** Sin 014 la app funciona; las imágenes muestran placeholder.

**Opcionales:**
- **OpenRouter (agente IA):** `OPENROUTER_ENABLED=true` y `OPENROUTER_API_KEY` en `backend/.env`. Sin ellos el agente responde 503 y el resto de la app funciona.
- **Imágenes IA de cultivos:** requieren proveedor (`IMAGE_GENERATION_PROVIDER`), bucket público `crop-illustrations` en Supabase Storage y la migración 014. Sin ellos, placeholder.

## Pruebas

### Backend

```bash
cd backend

# Ejecutar tests
pytest tests/ -v

# Lint con Ruff
ruff check .

# Auto-fix con Ruff
ruff check . --fix
```

### Frontend

```bash
cd frontend

# Type checking
npm run type-check

# Lint
npm run lint

# Build
npm run build
```

## Estructura del Proyecto

```
.
├── frontend/                    # React + Vite + TypeScript
│   ├── src/
│   │   ├── components/         # Componentes React
│   │   ├── services/           # Cliente API
│   │   ├── types/              # Type definitions
│   │   └── App.tsx
│   └── package.json
├── backend/                     # FastAPI
│   ├── app/
│   │   ├── core/              # Config y logging
│   │   ├── routers/           # Endpoints
│   │   ├── schemas/           # Pydantic models
│   │   ├── services/          # Lógica de negocio
│   │   └── main.py
│   ├── tests/                 # Pytest tests
│   ├── requirements.txt
│   └── Dockerfile
├── supabase/                    # Supabase & Migraciones
│   ├── config.toml
│   ├── migrations/
│   └── seed.sql
├── docs/                        # Documentación
│   ├── architecture.md
│   ├── database.md
│   └── sprints/
├── docker-compose.yml
└── README.md
```

## Documentación

- **[architecture.md](docs/architecture.md)**: Visión arquitectónica y principios
- **[database.md](docs/database.md)**: Diseño de base de datos
- **[sprints/sprint-01.md](docs/sprints/sprint-01.md)**: Detalle del Sprint 1

## Arquitectura Central

```
Frontend (React)
    ↓
VITE_API_BASE_URL
    ↓
FastAPI (Backend)
    ├→ Valida y autentica
    ├→ Consulta Supabase
    ├→ Integra APIs externas
    └→ Responde JSON
    ↓
Browser (UI actualizada)
```

## Principios Clave

✅ **Frontend**: NO accede directamente a Supabase admin keys ni OpenRouter
✅ **Backend**: Autoridad central de seguridad y datos
✅ **Database**: Extensiones PostGIS y pgvector habilitadas
✅ **Modular**: Features independientes, preparadas para 10 sprints

## Roadmap

- **Sprint 1** ✅: Foundation (estructura y health check)
- **Sprint 2-10**: Features principales (geografía, productores, marketplace, IA)

## CI/CD

Los cambios se validan automáticamente con GitHub Actions:
- Backend: Ruff lint + pytest
- Frontend: Type checking + ESLint + build

Ver `.github/workflows/ci.yml`

## Contribuyendo

1. Trabaja en una rama feature: `git checkout -b feature/sprint-XX-name`
2. Implementa cambios
3. Ejecuta tests y lint localmente
4. Push y abre PR hacia `main`
5. Espera aprobación del CI y code review

## Licencia

Por definir

## Contacto

Equipo AgroMapa: [email/contacto]
