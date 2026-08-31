-- Sprint 02: Territorial agriculture data model
-- Integrates real geographic and agricultural data from official sources

-- Data source tracking
create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text unique not null,
  name text not null,
  description text,
  url text,
  created_at timestamp with time zone default now()
);

insert into public.data_sources (source_key, name, description, url) values
  ('upra_eva', 'EVA UPRA', 'Evaluaciones Agropecuarias Municipales 2019-2024', 'https://www.datos.gov.co'),
  ('upra_geo', 'UPRA Geographic Reference', 'Geographic entities (departments, municipalities)', 'https://geoservicios.upra.gov.co'),
  ('agromapa', 'AgroMapa', 'User-registered farms and offers', null)
on conflict (source_key) do nothing;

-- Geographic units (Colombia hierarchy)
create table if not exists public.geo_units (
  id uuid primary key default gen_random_uuid(),
  level text not null, -- 'country', 'department', 'municipality', 'corregimiento', 'vereda'
  dane_code text,
  parent_id uuid references public.geo_units(id),
  name text not null,
  geom geometry(MultiPolygon, 4326),
  centroid geometry(Point, 4326),
  attributes jsonb,
  source_id uuid references public.data_sources(id),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(level, dane_code)
);

create index idx_geo_units_level on public.geo_units(level);
create index idx_geo_units_dane_code on public.geo_units(dane_code);
create index idx_geo_units_parent on public.geo_units(parent_id);
create index idx_geo_units_geom on public.geo_units using gist(geom);

-- Agricultural statistics (EVA source)
create table if not exists public.agricultural_stats (
  id uuid primary key default gen_random_uuid(),
  geo_unit_id uuid not null references public.geo_units(id),
  year integer not null,
  period text,
  crop_name text not null,
  crop_group text,
  crop_subgroup text,
  area_planted_ha numeric(12, 2),
  area_harvested_ha numeric(12, 2),
  production_tons numeric(12, 2),
  yield_t_ha numeric(8, 4),
  raw_data jsonb,
  source_id uuid not null references public.data_sources(id),
  created_at timestamp with time zone default now(),
  unique(geo_unit_id, year, crop_name, source_id)
);

create index idx_ag_stats_geo_unit on public.agricultural_stats(geo_unit_id);
create index idx_ag_stats_year on public.agricultural_stats(year);
create index idx_ag_stats_crop on public.agricultural_stats(crop_name);

-- Farms registered in AgroMapa
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  municipality_id uuid not null references public.geo_units(id),
  corregimiento_name text,
  vereda_name text,
  latitude numeric(10, 6) not null,
  longitude numeric(10, 6) not null,
  geom geometry(Point, 4326),
  verified boolean default false,
  producer_name text,
  producer_contact text,
  source_id uuid references public.data_sources(id),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index idx_farms_municipality on public.farms(municipality_id);
create index idx_farms_geom on public.farms using gist(geom);

-- Farm crops
create table if not exists public.farm_crops (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  crop_name text not null,
  description text,
  area_hectares numeric(8, 2),
  expected_harvest_at date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index idx_farm_crops_farm on public.farm_crops(farm_id);

-- Production offers
create table if not exists public.production_offers (
  id uuid primary key default gen_random_uuid(),
  farm_crop_id uuid not null references public.farm_crops(id) on delete cascade,
  available_quantity numeric(12, 2),
  unit text, -- 'kg', 'tons', 'units', etc.
  availability_start date,
  availability_end date,
  expected_harvest_at date,
  price_per_unit numeric(10, 2),
  description text,
  active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index idx_offers_farm_crop on public.production_offers(farm_crop_id);
create index idx_offers_active on public.production_offers(active);

-- Sync runs tracking
create table if not exists public.source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.data_sources(id),
  sync_type text not null, -- 'geo_units', 'agricultural_stats', etc.
  status text not null, -- 'pending', 'running', 'success', 'failed'
  started_at timestamp with time zone default now(),
  completed_at timestamp with time zone,
  records_processed integer default 0,
  records_created integer default 0,
  records_updated integer default 0,
  errors_count integer default 0,
  error_details jsonb,
  created_at timestamp with time zone default now()
);

create index idx_sync_runs_source on public.source_sync_runs(source_id);
create index idx_sync_runs_status on public.source_sync_runs(status);

-- API views for efficient queries
create or replace view public.geo_units_api as
select
  id,
  level,
  dane_code,
  name,
  st_asgeojson(geom)::jsonb as geojson,
  st_asgeojson(centroid)::jsonb as centroid_geojson,
  parent_id,
  (select name from geo_units where id = geo_units.parent_id) as parent_name,
  created_at,
  updated_at
from geo_units;

create or replace view public.farms_api as
select
  f.id,
  f.name,
  f.description,
  f.municipality_id,
  (select name from geo_units where id = f.municipality_id) as municipality_name,
  f.corregimiento_name,
  f.vereda_name,
  f.latitude,
  f.longitude,
  st_asgeojson(f.geom)::jsonb as geojson,
  f.verified,
  f.producer_name,
  jsonb_agg(
    jsonb_build_object(
      'id', fc.id,
      'crop_name', fc.crop_name,
      'area_hectares', fc.area_hectares,
      'expected_harvest_at', fc.expected_harvest_at
    )
  ) as crops,
  f.created_at
from farms f
left join farm_crops fc on fc.farm_id = f.id
group by f.id;

create or replace view public.municipality_farm_multipoints as
select
  g.id as municipality_id,
  g.name as municipality_name,
  g.dane_code,
  st_collect(f.geom) as farm_points,
  count(f.id) as farm_count
from geo_units g
left join farms f on f.municipality_id = g.id
where g.level = 'municipality'
group by g.id, g.name, g.dane_code;

-- Enable RLS
alter table public.geo_units enable row level security;
alter table public.agricultural_stats enable row level security;
alter table public.farms enable row level security;
alter table public.farm_crops enable row level security;
alter table public.production_offers enable row level security;
alter table public.source_sync_runs enable row level security;
alter table public.data_sources enable row level security;

-- RLS policies (allow all for now, restrict in auth sprint)
create policy "geo_units_select_all" on public.geo_units for select using (true);
create policy "agricultural_stats_select_all" on public.agricultural_stats for select using (true);
create policy "farms_select_all" on public.farms for select using (true);
create policy "farm_crops_select_all" on public.farm_crops for select using (true);
create policy "production_offers_select_all" on public.production_offers for select using (true);

-- Allow inserts from service role (backend)
create policy "geo_units_insert_service" on public.geo_units for insert with check (true);
create policy "agricultural_stats_insert_service" on public.agricultural_stats for insert with check (true);
create policy "farms_insert_dev" on public.farms for insert with check (true);
create policy "farm_crops_insert_dev" on public.farm_crops for insert with check (true);
create policy "production_offers_insert_dev" on public.production_offers for insert with check (true);

comment on table public.geo_units is 'Geographic units hierarchy: country, departments, municipalities, corregimientos, veredas';
comment on table public.agricultural_stats is 'Agricultural statistics from EVA (Evaluaciones Agropecuarias)';
comment on table public.farms is 'Farms registered in AgroMapa platform';
comment on table public.farm_crops is 'Crops grown in each farm';
comment on table public.production_offers is 'Current production offers from farms';
comment on table public.source_sync_runs is 'Tracking of data synchronization runs from external sources';
