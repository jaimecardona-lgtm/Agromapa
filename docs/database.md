# Base de Datos: Supabase PostgreSQL

## Configuración Inicial

### Extensiones Habilitadas
- **postgis**: Datos geoespaciales (geometría, geografía)
- **pgvector**: Vectorización para RAG y búsqueda semántica

### Funciones de Sistema
- `public.health_check()`: Verifica conectividad desde API

### Tablas Iniciales
- `audit_log`: Registro de cambios (preparación para RLS)

## Estructura de Migraciones

```
supabase/
├── config.toml              # Configuración local de Supabase
├── migrations/
│   └── 001_initial_setup.sql
└── seed.sql                 # Datos de desarrollo
```

### Versionado de Migraciones
- Formato: `NNN_description.sql`
- Ejecutadas en orden ascendente
- Idempotentes (uso de `if not exists`)

## Acceso Desde Backend

```python
from supabase import create_client

client = create_client(url, secret_key)
response = client.table('tablename').select('*').execute()
```

## Modelos Futuros (Sprint 2+)

### Geografía
```sql
create table geography (
  id uuid primary key,
  level text,  -- 'país', 'departamento', 'municipio', 'vereda'
  name text,
  parent_id uuid,
  geom geometry(polygon, 4326),
  centroid geometry(point, 4326)
);
```

### Productores
```sql
create table producers (
  id uuid primary key,
  name text,
  document_id text,
  geography_id uuid,
  contact jsonb,
  verified_at timestamp
);
```

### Cultivos y Producción
```sql
create table crops (
  id uuid primary key,
  farm_id uuid,
  crop_name text,
  area_hectares numeric,
  harvest_season text,
  vectors vector(1536)  -- para RAG
);
```

### Marketplace
```sql
create table offers (
  id uuid primary key,
  producer_id uuid,
  crop_id uuid,
  quantity numeric,
  unit text,
  price_per_unit numeric,
  availability_start date,
  availability_end date
);
```

## Row Level Security (RLS)

Implementación planejada para:
- Productores: solo acceden datos propios
- Compradores: ven ofertas públicas
- Admin: acceso total

## Local Development

```bash
# Iniciar Supabase local
supabase start

# Ejecutar migraciones
supabase db push

# Seed data
supabase db seed

# Ver estado
supabase status
```

## Production

- Base de datos hospedada en Supabase Cloud
- Backups automáticos
- RLS obligatorio en producción
- Environment variables en hosting provider
