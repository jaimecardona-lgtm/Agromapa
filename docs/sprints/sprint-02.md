# Sprint 02: Territorial Agriculture Data

## Objetivo

Convertir AgroMapa de una plataforma con datos inventados a un visor territorial con **datos reales** de fuentes oficiales.

**No más puntos hardcodeados.**

---

## Fuentes de Datos Implementadas

### 1. EVA (Evaluaciones Agropecuarias Municipales)

- **Proveedor**: UPRA / Datos Abiertos Colombia
- **Tipo**: Socrata API
- **Resource ID**: `uejq-wxrr`
- **Host**: `www.datos.gov.co`
- **Datos**: Estadísticas agrícolas municipales 2019-2024
  - Área sembrada (hectáreas)
  - Área cosechada (hectáreas)
  - Producción (toneladas)
  - Rendimiento (t/ha)

**Job de sincronización**:
```bash
# Sincronizar 2024 (por defecto)
python -m app.jobs.sync_eva --year 2024

# Sincronizar año específico
python -m app.jobs.sync_eva --year 2023

# Sincronizar todos los años disponibles
python -m app.jobs.sync_eva --all-years
```

### 2. UPRA Geographic Reference

- **Proveedor**: UPRA
- **Tipo**: ArcGIS REST API
- **Host**: `geoservicios.upra.gov.co`
- **Capas**:
  - Departamentos (layer 7)
  - Municipios (layer 8)
  - Centros poblados (layer 9)

**Job de sincronización**:
```bash
python -m app.jobs.sync_upra_geo
```

---

## Arquitectura de Datos

### Modelo SQL Sprint 02

```
supabase/migrations/002_territorial_agriculture.sql
```

**Tablas principales**:

#### geo_units
- Jerarquía territorial: país → departamento → municipio
- Geometría real desde ArcGIS (MultiPolygon PostGIS)
- Centroide calculado
- DANE codes conservados sin truncar

#### agricultural_stats
- Estadísticas por municipio/año/cultivo
- Origen: EVA
- Vinculada a geo_units

#### farms
- Fincas registradas en AgroMapa
- Ubicación: point (latitude, longitude)
- Origen: AgroMapa (usuarios)
- Campo `verified` para auditoría futura

#### farm_crops & production_offers
- Cultivos de cada finca
- Ofertas de producción
- Disponibilidad y precios

---

## Nuevos Endpoints

### Territorios

#### GET /api/territories/departments
Retorna todos los departamentos con geometría real.

```json
{
  "count": 32,
  "data": [
    {
      "id": "uuid",
      "level": "department",
      "dane_code": "76",
      "name": "Valle del Cauca",
      "geojson": {...},
      "centroid_geojson": {...}
    }
  ]
}
```

#### GET /api/territories/departments/{code}/municipalities
Retorna municipios de un departamento.

```json
{
  "count": 42,
  "data": [
    {
      "id": "uuid",
      "level": "municipality",
      "dane_code": "76001",
      "name": "Cali",
      "parent_name": "Valle del Cauca"
    }
  ]
}
```

#### GET /api/territories/departments/{dept_code}/municipalities/{mun_code}
Detalle de un municipio.

### Agricultura

#### GET /api/agriculture/municipalities/{code}?year=2024
Estadísticas agrícolas de un municipio.

```json
{
  "data": {
    "municipality": {
      "dane_code": "76001",
      "name": "Cali"
    },
    "year": 2024,
    "source": {
      "id": "upra_eva",
      "name": "EVA"
    },
    "crops": [
      {
        "crop_name": "Caña de azúcar",
        "crop_group": "Productos permanentes",
        "area_planted_ha": 12500.5,
        "area_harvested_ha": 12000.3,
        "production_tons": 650000,
        "yield_t_ha": 54.16
      }
    ],
    "total_area_planted_ha": 45000,
    "total_production_tons": 1200000
  }
}
```

**NO datos ficticios**: Si no hay datos, devuelve instrucción de sincronización.

### Fincas

#### GET /api/farms/municipalities/{code}
Fincas registradas en un municipio.

```json
{
  "count": 3,
  "data": [
    {
      "id": "uuid",
      "name": "La Esperanza",
      "municipality_name": "Cali",
      "latitude": 3.5407,
      "longitude": -76.3050,
      "geojson": {...},
      "crops": [...],
      "verified": false
    }
  ]
}
```

#### POST /api/farms/ (development only)
Crear finca (solo si APP_ENV=development).

```json
{
  "name": "Mi Finca",
  "municipality_code": "76001",
  "latitude": 3.5407,
  "longitude": -76.3050,
  "description": "Descripción opcional",
  "corregimiento_name": "Corregimiento",
  "vereda_name": "Vereda"
}
```

---

## Ejecución Paso a Paso

### 1. Preparar Environment

```bash
cd backend

# Crear .env.local basado en .env.example
cp .env.example .env.local

# Configurar Supabase si deseas datos persistidos:
# SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_SECRET_KEY=xxxxx

# Si no configuras Supabase, los jobs reportarán error
# pero luego mostrarán qué está faltando
```

### 2. Instalar Dependencias

```bash
pip install -r requirements.txt
```

### 3. Ejecutar Sincronización UPRA Geographic

```bash
python -m app.jobs.sync_upra_geo

# Esperado:
# INFO: Fetching departments from UPRA...
# INFO: Got 32 departments
# INFO: Fetching municipalities from UPRA...
# INFO: Got 1122 municipalities
# INFO: Sync completed: processed=1154, created=1154, errors=0
```

### 4. Ejecutar Sincronización EVA 2024

```bash
python -m app.jobs.sync_eva --year 2024

# Esperado:
# INFO: Starting EVA sync for year 2024
# INFO: EVA sync 2024 completed: processed=XXXX, created=XXXX, errors=0
```

### 5. Verificar en Supabase

```sql
-- Departamentos
SELECT COUNT(*) as dept_count FROM geo_units WHERE level = 'department';
-- Esperado: ~32

-- Municipios
SELECT COUNT(*) as mun_count FROM geo_units WHERE level = 'municipality';
-- Esperado: ~1122

-- Estadísticas agrícolas 2024
SELECT COUNT(*) as stats_count FROM agricultural_stats WHERE year = 2024;
-- Esperado: miles de registros

-- Verificar Cali específicamente
SELECT crop_name, area_planted_ha, production_tons
FROM agricultural_stats
WHERE geo_unit_id = (SELECT id FROM geo_units WHERE dane_code = '76001' AND level = 'municipality')
AND year = 2024
LIMIT 5;
```

### 6. Iniciar Backend

```bash
python -m uvicorn app.main:app --reload
```

### 7. Consultar Endpoints

```bash
# Departamentos
curl http://localhost:8000/api/territories/departments | jq '.data[0]'

# Municipios de Valle del Cauca
curl "http://localhost:8000/api/territories/departments/76/municipalities" | jq '.data[0:3]'

# Estadísticas de Cali 2024
curl "http://localhost:8000/api/agriculture/municipalities/76001?year=2024" | jq '.data.crops[0:3]'
```

---

## Frontend: Drill-Down Territorial

### Cambios en Frontend

El frontend **ya NO usa `/api/demo/map-points`**.

Nueva interfaz:

1. **Inicio**: Mapa con departamentos (polígonos reales)
2. **Clic departamento**: 
   - Zoom a departamento
   - Cargar y mostrar municipios
   - Actualizar breadcrumb
3. **Clic municipio**:
   - Zoom a municipio
   - Panel lateral con info EVA
   - Cargar y mostrar fincas (puntos)
4. **Clic finca**:
   - Panel con detalle de finca
   - Cultivos y ofertas si existen

### Breadcrumbs

```
Colombia > Valle del Cauca > Cali
```

### API Calls desde Frontend

```typescript
// Obtener departamentos
GET /api/territories/departments

// Obtener municipios
GET /api/territories/departments/76/municipalities

// Obtener stats agrícolas
GET /api/agriculture/municipalities/76001?year=2024

// Obtener fincas
GET /api/farms/municipalities/76001
```

---

## Diferencias Semánticas CRÍTICAS

### ❌ NO hacer

- Confundir EVA (estadística territorial agregada) con "disponibilidad actual para venta"
- Mostrar datos de EVA como si fueran ofertas de fincas
- Inventar polígonos de municipios

### ✅ SÍ hacer

- Etiqueta clara: "Datos EVA 2024 - Estadísticas Agrícolas Municipales"
- Panel separado para "Fincas Registradas en AgroMapa"
- Geometría real desde UPRA ArcGIS
- Si no hay datos EVA: "No se encontraron datos"
- Si no hay fincas: "No hay fincas registradas"

---

## Validación de Completitud

Checklist antes de marcar Sprint 02 como completo:

- [ ] `sync_upra_geo` ejecutado: `~1154` registros
- [ ] `sync_eva --year 2024` ejecutado: miles de registros
- [ ] Departamentos visibles en mapa
- [ ] Municipios cargables por departamento
- [ ] Estadísticas EVA mostradas para Cali u otro municipio
- [ ] Fincas registrables en development mode
- [ ] Breadcrumbs funcionales
- [ ] SIN puntos inventados
- [ ] Endpoints devuelven datos reales de Supabase
- [ ] Tests de integración básicos
- [ ] Documentación actualizada

---

## Deuda Técnica

**Ninguna crítica**. Items para sprints futuros:

- [ ] Autenticación Supabase Auth
- [ ] RLS row-level security por usuario
- [ ] Niveles corregimiento/vereda (con fuentes verificadas)
- [ ] ETL incremental (solo cambios desde última sync)
- [ ] Caché de geometrías en frontend
- [ ] Compresión de GeoJSON
- [ ] Validación de coordenadas de fincas
- [ ] Fotos de fincas + multimédia
- [ ] Moderación de fincas registradas

---

## Conclusión

**AgroMapa Sprint 02** es una plataforma territorial con:

✅ Geografía real (UPRA)
✅ Agricultura real (EVA)
✅ Fincas propias (AgroMapa - pendiente populating)
✅ Drill-down interactivo
✅ Sin datos inventados
✅ Pronto: Autorización y Marketplace real
