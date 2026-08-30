# Arquitectura AgroMapa Colombia

## Visión General

AgroMapa Colombia es una plataforma web geoespacial que permite navegar desde Colombia hacia departamentos, municipios, veredas, fincas y lotes, caracterizando productores y producción agrícola, conectando compradores con productores, y enriqueciendo datos con información agroambiental e inteligencia artificial.

## Principios Arquitectónicos

1. **Centralización de Autoridad**: FastAPI es la autoridad central del sistema
2. **Separación de Responsabilidades**: Frontend, Backend y Database aislados
3. **Sin Acceso Directo a Secretos en Frontend**: El frontend NO accede a Supabase admin keys ni OpenRouter
4. **Modularidad por Features**: Código organizado en features independientes
5. **Escalabilidad**: Preparado para crecimiento sin refactoring mayor

## Capas de Arquitectura

### 1. Presentación (Frontend)
- **Stack**: React + Vite + TypeScript
- **Ubicación**: `/frontend`
- **Características**:
  - Arquitectura modular por features
  - Cliente HTTP centralizado para consumir FastAPI
  - Sin credenciales de Supabase o APIs de IA
  - Visualización geoespacial (preparado)

**Features Planejadas**:
- `features/geo` - Navegación geográfica
- `features/farms` - Gestión de fincas
- `features/production` - Caracterización de producción
- `features/marketplace` - Conexión comprador-productor
- `features/analytics` - Análisis y reportes
- `features/assistant` - Asistente IA

### 2. Lógica de Negocio (Backend)
- **Stack**: FastAPI + Python 3.11
- **Ubicación**: `/backend`
- **Responsabilidades**:
  - Autorización y autenticación
  - Orquestación de Supabase
  - Integración con APIs externas (OpenRouter, datos gubernamentales)
  - Validación de negocio
  - RAG y procesamiento de IA

**Estructura**:
```
backend/app/
├── core/
│   ├── config.py        # Pydantic Settings
│   └── logging.py       # Logger configurado
├── routers/             # Endpoints por dominio
├── schemas/             # Pydantic models
├── services/            # Lógica de negocio
├── repositories/        # Acceso a datos
└── integrations/        # APIs externas
```

### 3. Persistencia (Database)
- **Stack**: Supabase PostgreSQL + PostGIS + pgvector
- **Ubicación**: `/supabase`
- **Características**:
  - Extensiones geoespaciales (PostGIS)
  - Vectorización (pgvector) para RAG
  - Row Level Security (RLS) para autorización
  - Migraciones versionadas

## Flujo de Datos

```
Cliente (React)
    ↓
VITE_API_BASE_URL (http://localhost:8000)
    ↓
FastAPI (Puerto 8000)
    ├→ Valida request
    ├→ Autentica usuario
    ├→ Consulta Supabase (con secret key del backend)
    ├→ Llama APIs externas (OpenRouter, etc.)
    └→ Retorna JSON
    ↓
Cliente (actualiza UI)
```

## Convenciones

### Backend
- Python 3.11+
- Type hints en todo el código
- Pydantic para validación
- FastAPI routers por dominio
- Logging estructurado

### Frontend
- TypeScript strict mode
- Componentes funcionales con Hooks
- Servicios centralizados (no fetch directo en componentes)
- CSS modules o inline styles

### Database
- SQL en migrations
- Nombres en snake_case
- Timestamps con timezone
- Soft deletes donde aplique

## Seguridad

1. **CORS**: Configurado en FastAPI usando `FRONTEND_ORIGINS`
2. **Secrets**: Archivo `.env` local (gitignored)
3. **Supabase**: Solo acceso desde backend con secret key
4. **OpenRouter**: Solo acceso desde backend
5. **RLS**: Implementación futura en tablas sensibles

## Próximos Pasos

- Sprint 2-10: Implementación de features por dominio
- Autenticación con Supabase Auth
- RAG pipeline con pgvector
- Integración OpenRouter
- APIs de datos públicos (MINAGRICULTIRA, etc.)
