# Sprint 01: Foundation

## Objetivo
Dejar una base de ingeniería sólida y ejecutable para los siguientes nueve sprints.

## Completado ✅

### Frontend
- [x] Proyecto React + Vite + TypeScript
- [x] Arquitectura modular por features
- [x] Configuración de rutas y alias
- [x] Cliente HTTP centralizado (Axios)
- [x] Componente HealthCheck para verificar estado de backend
- [x] ESLint + Prettier configurados
- [x] Dockerfile para producción
- [x] `.env.example` sin secretos

### Backend
- [x] Proyecto FastAPI
- [x] Pydantic Settings (config centralizada)
- [x] Estructura de routers, schemas, services
- [x] Router de health check (`GET /api/health`)
- [x] CORS configurado
- [x] Supabase service (preparado)
- [x] Logging estructurado
- [x] `.env.example` sin secretos
- [x] Dockerfile para producción

### Database (Supabase)
- [x] Configuración local (`config.toml`)
- [x] Migración inicial: PostGIS, pgvector, health_check()
- [x] Tabla `audit_log` para trazabilidad
- [x] `seed.sql` para desarrollo

### Testing
- [x] Tests de health check
- [x] Tests de config
- [x] Pytest + pytest-asyncio

### DevOps
- [x] `docker-compose.yml` para desarrollo local
- [x] GitHub Actions CI: backend (Ruff + pytest), frontend (type-check + lint + build)
- [x] Servicio PostgreSQL en Docker Compose

### Documentation
- [x] `docs/architecture.md` - Visión y principios
- [x] `docs/database.md` - Modelado de datos
- [x] `docs/sprints/sprint-01.md` - Este documento
- [x] README actualizado con instrucciones

## Archivos Creados

### Frontend
```
frontend/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── eslint.config.js
├── .env.example
├── .gitignore
├── Dockerfile
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── App.css
    ├── index.css
    ├── types/
    │   └── health.ts
    ├── services/
    │   └── api.ts
    └── components/
        ├── HealthCheck.tsx
        └── HealthCheck.css
```

### Backend
```
backend/
├── requirements.txt
├── pyproject.toml
├── .env.example
├── .gitignore
├── Dockerfile
└── app/
    ├── main.py
    ├── core/
    │   ├── config.py
    │   └── logging.py
    ├── routers/
    │   └── health.py
    ├── schemas/
    │   └── health.py
    └── services/
        └── supabase_service.py
└── tests/
    ├── test_health.py
    └── test_config.py
```

### Database
```
supabase/
├── config.toml
├── migrations/
│   └── 001_initial_setup.sql
└── seed.sql
```

### DevOps & CI
```
├── docker-compose.yml
├── .github/workflows/
│   └── ci.yml
```

### Documentation
```
docs/
├── architecture.md
├── database.md
└── sprints/
    └── sprint-01.md
```

## Deuda Técnica

### Ninguna conocida ✅
- Código modular desde inicio
- Type safety en ambos lenguajes
- Configuración limpia
- Tests básicos en backend
- CI/CD configurado

## Próximo Sprint (Sprint 02)

- [ ] Autenticación con Supabase Auth
- [ ] Modelos de datos: geography, producers, farms, crops
- [ ] Endpoints CRUD para productores
- [ ] Tests e2e básicos
- [ ] Diseño de UI para módulo geo

## Testing Local

```bash
# Backend
cd backend
python -m pytest tests/ -v
ruff check .

# Frontend
cd frontend
npm install
npm run type-check
npm run lint
npm run build
```

## Ejecutar en Local

```bash
# Instalación inicial
npm install      # Frontend dependencies
pip install -r requirements.txt  # Backend dependencies

# Development
npm run dev      # Frontend en puerto 5173
python -m uvicorn app.main:app --reload  # Backend en puerto 8000

# O con Docker Compose
docker-compose up
```
