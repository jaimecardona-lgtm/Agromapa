-- ============================================================
-- Raíces Conectadas
-- Migration 008: Operational agroproductive model
-- Additive / idempotent migration
-- ============================================================

-- ------------------------------------------------------------
-- 1. PRODUCERS
-- ------------------------------------------------------------

create table if not exists public.producers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document_type text,
  document_number text,
  phone text,
  email text,
  organization text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_producers_active
  on public.producers(active);

create index if not exists idx_producers_document
  on public.producers(document_number);


-- ------------------------------------------------------------
-- 2. EXTEND FARMS
-- ------------------------------------------------------------

alter table public.farms
  add column if not exists producer_id uuid references public.producers(id),
  add column if not exists area_ha numeric(12,2),
  add column if not exists department_code text,
  add column if not exists municipality_code text,
  add column if not exists active boolean not null default true;

create index if not exists idx_farms_producer
  on public.farms(producer_id);

create index if not exists idx_farms_department_code
  on public.farms(department_code);

create index if not exists idx_farms_municipality_code
  on public.farms(municipality_code);


-- ------------------------------------------------------------
-- 3. EXTEND PRODUCTION OFFERS
-- ------------------------------------------------------------

alter table public.production_offers
  add column if not exists status text not null default 'available',
  add column if not exists harvested_at timestamp with time zone,
  add column if not exists notes text,
  add column if not exists source_id uuid;


-- ------------------------------------------------------------
-- 4. STATUS CONSTRAINT
-- PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS,
-- therefore inspect pg_constraint first.
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'valid_offer_status'
      and conrelid = 'public.production_offers'::regclass
  ) then
    alter table public.production_offers
      add constraint valid_offer_status
      check (
        status in (
          'available',
          'harvested',
          'sold_out',
          'inactive',
          'historical'
        )
      );
  end if;
end
$$;


-- ------------------------------------------------------------
-- 5. INDICES
-- ------------------------------------------------------------

create index if not exists idx_offers_status
  on public.production_offers(status);

create index if not exists idx_offers_availability
  on public.production_offers(availability_start, availability_end);


-- ------------------------------------------------------------
-- 6. DATA SOURCE
--
-- A subquery cannot be used directly as a DEFAULT expression.
-- Populate existing rows safely instead.
-- ------------------------------------------------------------

update public.production_offers po
set source_id = ds.id
from public.data_sources ds
where ds.source_key = 'agromapa'
  and po.source_id is null;


-- ------------------------------------------------------------
-- 7. RLS
-- ------------------------------------------------------------

alter table public.producers enable row level security;


-- producers_select_all
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'producers'
      and policyname = 'producers_select_all'
  ) then
    create policy producers_select_all
      on public.producers
      for select
      using (true);
  end if;
end
$$;


-- producers_insert_dev
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'producers'
      and policyname = 'producers_insert_dev'
  ) then
    create policy producers_insert_dev
      on public.producers
      for insert
      with check (true);
  end if;
end
$$;


-- producers_update_dev
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'producers'
      and policyname = 'producers_update_dev'
  ) then
    create policy producers_update_dev
      on public.producers
      for update
      using (true)
      with check (true);
  end if;
end
$$;


-- farms_insert_with_producer
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'farms'
      and policyname = 'farms_insert_with_producer'
  ) then
    create policy farms_insert_with_producer
      on public.farms
      for insert
      with check (true);
  end if;
end
$$;


-- farms_update_dev
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'farms'
      and policyname = 'farms_update_dev'
  ) then
    create policy farms_update_dev
      on public.farms
      for update
      using (true)
      with check (true);
  end if;
end
$$;


-- production_offers_insert_operational
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'production_offers'
      and policyname = 'production_offers_insert_operational'
  ) then
    create policy production_offers_insert_operational
      on public.production_offers
      for insert
      with check (true);
  end if;
end
$$;


-- production_offers_update_operational
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'production_offers'
      and policyname = 'production_offers_update_operational'
  ) then
    create policy production_offers_update_operational
      on public.production_offers
      for update
      using (true)
      with check (true);
  end if;
end
$$;


-- ------------------------------------------------------------
-- 8. CURRENT OPERATIONAL OFFERS VIEW
-- ------------------------------------------------------------

create or replace view public.current_operational_offers as
select
  po.id,
  po.farm_crop_id,

  fc.farm_id,
  fc.crop_name,

  f.name as farm_name,

  p.name as producer_name,
  p.phone as producer_phone,
  p.email as producer_email,

  g.name as municipality_name,
  g.dane_code as municipality_code,

  po.available_quantity as quantity,
  po.unit,

  po.availability_start as available_from,
  po.availability_end as available_until,

  po.price_per_unit,
  po.expected_harvest_at,
  po.harvested_at,

  po.description,
  po.notes,
  po.status,

  'Raíces Conectadas'::text as source,
  'operational'::text as data_type,

  po.created_at,
  po.updated_at

from public.production_offers po

join public.farm_crops fc
  on fc.id = po.farm_crop_id

join public.farms f
  on f.id = fc.farm_id

join public.producers p
  on p.id = f.producer_id

join public.geo_units g
  on g.id = f.municipality_id

where po.status = 'available'

  and (
    po.availability_start is null
    or po.availability_start <= current_date
  )

  and (
    po.availability_end is null
    or po.availability_end >= current_date
  )

  and p.active = true
  and f.active = true

order by po.updated_at desc;


-- ------------------------------------------------------------
-- 9. COMMENTS
-- ------------------------------------------------------------

comment on table public.producers is
  'Producers and farm operators registered in Raíces Conectadas';

comment on table public.production_offers is
  'Operational production offers and harvest records from registered farms';

comment on column public.production_offers.status is
  'Operational status: available, harvested, sold_out, inactive, historical';

comment on column public.production_offers.harvested_at is
  'Date/time when the production was harvested';

comment on column public.production_offers.notes is
  'Operational notes associated with the production offer';

comment on view public.current_operational_offers is
  'Current operational offers from Raíces Conectadas registered farms';



select
    table_name,
    column_name,
    data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
      'farms',
      'farm_crops',
      'production_offers',
      'geo_units',
      'data_sources'
  )
order by table_name, ordinal_position;



select
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'producers'
  ) as producers_exists,

  exists (
    select 1
    from information_schema.views
    where table_schema = 'public'
      and table_name = 'current_operational_offers'
  ) as current_offer_view_exists;