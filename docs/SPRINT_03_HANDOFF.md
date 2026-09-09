# Sprint 03 AgroMapa Colombia - Handoff Document

**Date:** 2026-09-09  
**Status:** PHASE A & B Completed | PHASE C-F Audited (Not implemented)  
**Branch:** `feature/sprint-03-data-agent`

---

## ✅ COMPLETED WORK

### PHASE A: Territory Optimization
- ✅ 33 departments synchronized (sync_upra_geo)
- ✅ 1,123 municipalities with correct parent_id relationships
- ✅ Bogotá D.C. (DANE 11) handled correctly as capital district
- ✅ geo_units_map VIEW operational with ST_SimplifyPreserveTopology
- ✅ Migration 005 prepared (geo_units_map VIEW)
- ✅ Nuevo Belén de Bajirá (DANE 27493) documented + Migration 007 ready

**Database State:**
```
geo_units table:
- level: 'department' (33 rows)
- level: 'municipality' (1,123 rows)
- Relationships: all municipalities have parent_id to department
- Geometry: NULL for new entities (27493)
- Attributes: tracks origin, geometry status

geo_units_map VIEW:
- simplification: ST_SimplifyPreserveTopology
- tolerance: 0.01° (departments), 0.003° (municipalities)
- No WHERE geom IS NOT NULL (includes NULL geometry)
```

### PHASE B: EVA Data Pipeline
- ✅ 25,553 EVA 2024 records synchronized
- ✅ 25,553 unique source_record_key (SHA-256, 64 hex chars)
- ✅ Natural key: (municipality_dane, year, period, crop_cycle, crop_code, crop_disaggregation)
- ✅ 0 missing municipality DANE codes
- ✅ 0 duplicates
- ✅ 0 sync errors
- ✅ Bulk upsert via 52 batches (vs 25,553 individual calls)
- ✅ Paginación implemented: loads 1,122+ municipalities in 2 pages

**Database State:**
```
agricultural_stats table:
- 25,553 rows (EVA 2024)
- Columns:
  - geo_unit_id (FK to geo_units)
  - year, period, crop_cycle
  - crop_name, crop_code, crop_group, crop_subgroup, crop_disaggregation
  - crop_physical_state, crop_scientific_name
  - area_planted_ha, area_harvested_ha, production_tons, yield_t_ha
  - source_id (FK to data_sources)
  - source_record_key (SHA-256, 64 chars)
  - raw_data (JSONB, original EVA record)
  - created_at, updated_at

Indexes:
  - UNIQUE (source_id, source_record_key)
  - source_record_key lookup
  - geo_unit_id + year
  - crop_code
  - period
```

---

## 🔍 ARCHITECTURE - Current State

### Frontend
- **Framework:** React + TypeScript + Vite
- **Server:** `npm run dev` → localhost:5173
- **Proxy:** Vite dev server proxies `/api/*` → http://127.0.0.1:8000
- **API Base:** `import.meta.env.VITE_API_BASE_URL || ''` (empty by default, uses relative paths)
- **Build:** `npm run build` → dist/ (355KB gzipped)

### Backend
- **Framework:** FastAPI + Python 3.11
- **Server:** `uvicorn main:app --reload` → http://127.0.0.1:8000
- **Config:** Uses environment variables (Pydantic Settings)
- **Supabase Integration:** PostgreSQL + PostgREST

### Database (Supabase)
- **Tables:** geo_units, agricultural_stats, data_sources, source_sync_runs, audit_log, farms
- **Views:** geo_units_map (with ST_SimplifyPreserveTopology)
- **RLS:** Enabled (service_role access required for admin operations)

### Deployment Model (Render)
- **Frontend:** Served by FastAPI static files + SPA routing
- **Backend:** FastAPI application
- **Database:** Supabase (remote PostgreSQL)
- **Single port:** 8000 (both frontend HTML + API)

---

## 📊 PHASE C: Agriculture API

### Current Implementation

**Routers:** `backend/app/routers/agriculture.py`
- Single endpoint: `GET /api/agriculture/municipalities/{municipality_code}?year=2024`

**Services:** `backend/app/services/agriculture_service.py`
- `get_municipality_agriculture(municipality_code, year) → dict`
- Calls: geo_repo.get_by_dane_code() → ag_repo.get_by_municipality_and_year()
- Returns aggregated crops (5 fields only)

**Repositories:** `backend/app/repositories/agriculture_repository.py`
- `get_by_municipality_and_year(municipality_id, year) → list[dict]`
- Retrieves ALL database fields (9+ columns)
- Also has: `count_by_source(source_id)`
- New (not yet integrated): `bulk_upsert_stats(records, batch_size=500)`

**Schemas:** None in `backend/app/schemas/`
- Missing: AgriculturalStatSchema, AgriculturalDataSchema (Pydantic)

### What Service Currently Returns
```json
{
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
      "crop_name": "Caña",
      "crop_group": "Permanentes",
      "area_planted_ha": 450.5,
      "area_harvested_ha": 450.0,
      "production_tons": 22500.0,
      "yield_t_ha": 50.0
    }
  ],
  "total_area_planted_ha": 5000.0,
  "total_production_tons": 125000.0
}
```

### Database Can Provide (But Not Returned)
```
- crop_code (e.g., "2030402")
- crop_cycle (e.g., "Permanente")
- crop_disaggregation (e.g., "Caña panelera")
- crop_physical_state (e.g., "Cosecha")
- crop_scientific_name (e.g., "Saccharum officinarum")
- crop_subgroup (e.g., "Caña")
- period (e.g., "2024A", "2024B")
```

### GAPS - Phase C

| Gap | Impact | Priority |
|-----|--------|----------|
| Missing fields in response (7 columns) | Frontend cannot show crop_code, cycle, variety details | CRITICAL |
| No Pydantic schemas | Type safety, API documentation incomplete | HIGH |
| No department-level endpoint | Cannot aggregate stats by department | HIGH |
| No search/filter by crop | No "find all regions growing café" capability | MEDIUM |
| No year range query | Only single year supported | MEDIUM |
| No pagination/limit | Large municipality responses unbounded | LOW |

---

## 🗺️ PHASE D: Map & Frontend

### Current Implementation

**App Layout:** `frontend/src/App.tsx` (254 lines)
- Grid layout: header → breadcrumbs → [map-section | side-panel] → footer
- Responsive: 2-col desktop (1fr 350px), stacks on mobile (<1024px)
- State: selectedDepartment, selectedMunicipality, breadcrumb navigation

**Map Component:** `frontend/src/components/Map.tsx` (55 lines)
- Leaflet + react-leaflet
- Center: [4.5, -74.5], zoom: 6 (Colombia view)
- Features: GeoJSON polygons from API
- No ref management, no invalidateSize(), no fitBounds()

**CSS Layout:** `frontend/src/App.css` (276 lines)
```css
.map-container { height: 500px; }  /* HARDCODED - PROBLEM */
.content-container { flex: 1; overflow: hidden; }
.side-panel { max-height: 300px; overflow-y: auto; } /* Mobile */
```

**Map CSS:** `frontend/src/Map.css` (39 lines)
```css
.map { height: 100%; }
.map-container { height: 500px; } /* ← BLOCKS responsive behavior */
```

### Components Existing
- HealthCheck.tsx
- StatusPanel.tsx (agricultural data display)
- RoadmapCard.tsx
- Map.tsx
- **MISSING:** Chat.tsx, AgentPanel.tsx

### API Calls (Frontend)
`frontend/src/services/api.ts`
- `api.territories.getDepartments()`
- `api.territories.getMunicipalities(departmentCode)`
- `api.territories.getMunicipality(departmentCode, municipalityCode)`
- `api.agriculture.getMunicipality(municipalityCode, year=2024)` → **Uses limited response**
- `api.farms.getByMunicipality(municipalityCode)`

### TypeScript Types (Incomplete)
```typescript
export interface AgriculturalStat {
  crop_name: string;
  crop_group?: string;
  area_planted_ha?: number;
  area_harvested_ha?: number;
  production_tons?: number;
  yield_t_ha?: number;
  /* MISSING: crop_code, crop_cycle, crop_disaggregation, crop_physical_state, crop_scientific_name, crop_subgroup, period */
}
```

### GAPS - Phase D

| Gap | Impact | Priority |
|-----|--------|----------|
| Map height fixed to 500px | White space below map; doesn't scale to viewport | CRITICAL |
| No Leaflet invalidateSize() | Resize browser → map broken | HIGH |
| No fitBounds() | Map doesn't center on selected features | HIGH |
| Map always shows Colombia | No visual focus on department/municipality level | MEDIUM |
| Types don't match DB fields | Frontend breaks when API extended | HIGH |
| No "back" button in map | User stuck in municipality view | MEDIUM |

---

## 🤖 PHASE E: Master Agent

### Current State

**Configuration:** `backend/app/core/config.py`
```python
OPENROUTER_ENABLED: bool = False
OPENROUTER_API_KEY: str = ""
OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
```

**Backend Implementation:** **ZERO LINES OF CODE**
- No `backend/app/routers/agent.py`
- No agent service
- No OpenRouter client
- No LLM tools

**Frontend Implementation:** **ZERO LINES OF CODE**
- No Chat.tsx component
- No chat service in api.ts
- No OpenRouter calls
- No message UI

### GAPS - Phase E

| Gap | Impact | Priority |
|-----|--------|----------|
| No agent router | Cannot POST /api/agent/chat | CRITICAL |
| No LLM integration | Cannot call Claude/other model | CRITICAL |
| No tool definitions | Agent has no access to data | CRITICAL |
| No frontend UI | User cannot interact | CRITICAL |

---

## 📚 PHASE F: Sources & Transparency

### Current Data

**data_sources table:**
```
- source_key: 'upra_geo'
- source_key: 'upra_eva'
- source_key: 'agromapa_farms'
```

**source_sync_runs table:**
```
- Tracks sync_eva runs
- Fields: source_id, sync_type, status, records_processed, records_created, errors_count, started_at, completed_at
```

**Existing UI:**
- ✓ StatusPanel shows some source info
- ✗ No dedicated "Data Sources" page/panel
- ✗ No last-sync-time display
- ✗ No data freshness indicator

### GAPS - Phase F

| Gap | Impact | Priority |
|-----|--------|----------|
| No sources page | User doesn't know data provenance | MEDIUM |
| No sync timestamps | User doesn't know data freshness | MEDIUM |
| No year availability info | User doesn't know which years are available | LOW |

---

## ⚠️ CRITICAL RULES (DO NOT BREAK)

1. **No demo/fake data** - All data is real EVA 2024
2. **Frontend never directly queries Supabase** - Use /api endpoints only
3. **EVA is historical** - Not current availability; don't conflate with farms/offers
4. **Farms/Offers separate** - Different data source, different semantics
5. **Never fabricate geometry** - NULL is valid state; document as "pending_official_geometry"
6. **Same-origin in production** - Use relative `/api` paths
7. **Vite proxy locally** - `/api` → 127.0.0.1:8000 (not localhost)
8. **No destructive changes** - Can add, can fix, cannot break existing data/functions

---

## 📋 Existing Endpoints (Verified)

### Territories
- `GET /api/health`
- `GET /api/territories/departments`
- `GET /api/territories/departments/{code}`
- `GET /api/territories/departments/{code}/municipalities`
- `GET /api/territories/departments/{code}/municipalities/{code}`

### Agriculture
- `GET /api/agriculture/municipalities/{code}?year=2024`

### Farms
- `GET /api/farms`
- `GET /api/farms/municipalities/{code}`

### MISSING (To Implement)
- `GET /api/agriculture/departments/{code}?year=2024`
- `GET /api/agriculture/search?crop=...&year=...`
- `POST /api/agent/chat` (body: message + context)

---

## 🚀 Recommended Next Implementation Order

1. **Phase C.1:** Extend agriculture service to return all 9+ fields
2. **Phase C.2:** Create agriculture schemas (Pydantic)
3. **Phase C.3:** Add department-level endpoint
4. **Phase C.4:** Add search endpoint
5. **Phase D.1:** Fix Map.css height (critical visual bug)
6. **Phase D.2:** Implement Leaflet invalidateSize + fitBounds
7. **Phase D.3:** Update TypeScript types to match extended API
8. **Manual verification:** Test in browser with real data
9. **Phase E:** Master Agent implementation (router + service + frontend)
10. **Phase F:** Sources transparency UI
11. **Tests & validation:** pytest, npm run build
12. **Git commit + push** when complete

---

## 📁 File Inventory

### Backend Routers (5 files)
- `agriculture.py` (1 endpoint, needs 3 more)
- `territories.py` (4 endpoints, complete)
- `farms.py` (2 endpoints, complete)
- `health.py` (1 endpoint, complete)
- `__init__.py`

### Backend Schemas (2 files)
- `health.py` (only schema)
- `__init__.py`
- **MISSING:** `agriculture.py` (needs creating)

### Backend Services (2 files)
- `agriculture_service.py` (needs field extension)
- Related: `agriculture_repository.py`, `geo_repository.py`

### Frontend Components (4 files)
- `Map.tsx` (needs lifecycle handling)
- `StatusPanel.tsx` (agriculture display)
- `HealthCheck.tsx`
- `RoadmapCard.tsx`
- **MISSING:** `Chat.tsx`, `AgentPanel.tsx`

### Frontend Services (1 file)
- `api.ts` (types + axios client, needs type updates)

### Frontend CSS (3 files)
- `App.css` (layout, needs review)
- `Map.css` (500px hardcoded issue)
- `index.css` (minimal)

---

## ✅ Session Handoff Checklist

- [x] PHASE A completed and documented
- [x] PHASE B completed and documented
- [x] 25,553 EVA records synchronized with 0 errors
- [x] All gaps audited for PHASE C-F
- [x] Architecture documented
- [x] No code changes made to C-F (audit only)
- [x] Handoff document created
- [x] Critical rules documented
- [x] File inventory complete

**Ready for:** Next session to implement PHASE C-F

---

## 🔗 Related Documentation

- Migration 005: geo_units_map VIEW with geometry simplification
- Migration 006: agricultural_stats schema with EVA 2024
- Migration 007: Nuevo Belén de Bajirá (DANE 27493) geo_units entry
- EVA Client: Full crop metadata capture (crop_code, crop_cycle, etc.)
- Sync Job: Bulk upsert with paginación support
