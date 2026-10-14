begin;

-- ============================================================
-- 010_harden_operational_rls.sql
-- Raíces Conectadas
--
-- El modelo operacional se administra exclusivamente mediante
-- el backend FastAPI, que utiliza credenciales administrativas.
-- El frontend no debe acceder directamente a estas tablas.
-- ============================================================

alter table public.producers enable row level security;
alter table public.farms enable row level security;
alter table public.farm_crops enable row level security;
alter table public.production_offers enable row level security;

-- Producers
drop policy if exists "producers_insert_dev"
on public.producers;

drop policy if exists "producers_select_all"
on public.producers;

drop policy if exists "producers_update_dev"
on public.producers;

-- Farms
drop policy if exists "farms_insert_with_producer"
on public.farms;

drop policy if exists "farms_select_all"
on public.farms;

drop policy if exists "farms_update_dev"
on public.farms;

-- Farm crops
drop policy if exists "farm_crops_select_all"
on public.farm_crops;

-- Production offers
drop policy if exists "production_offers_insert_operational"
on public.production_offers;

drop policy if exists "production_offers_select_all"
on public.production_offers;

drop policy if exists "production_offers_update_operational"
on public.production_offers;

commit;