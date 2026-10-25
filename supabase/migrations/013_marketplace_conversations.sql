-- ============================================================
-- 013_marketplace_conversations.sql
-- Raíces Conectadas: marketplace público seguro + conversaciones internas.
--
-- 1. current_operational_offers se recrea SIN teléfono ni email legacy.
--    El contacto sale solo de producer_profiles y únicamente cuando
--    contact_visible = true. Nunca se usa el email de auth.users.
--    La vista deja de ser legible por anon/authenticated: el backend
--    FastAPI (clave administrativa) es el único lector.
-- 2. conversations: contexto comercial (comprador, productor, oferta, finca).
-- 3. messages: texto plano, con validación de longitud y contenido.
--
-- RLS activo SIN políticas para anon/authenticated. El frontend no lee ni
-- escribe estas tablas directamente: todo pasa por /api/conversations.
--
-- Additive / idempotente. No toca 009-012.
-- Ejecutar MANUALMENTE en Supabase (no se aplica automáticamente).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. CURRENT OPERATIONAL OFFERS: versión sin datos privados
-- Columnas de contacto públicas calculadas aquí, en un único lugar.
-- ------------------------------------------------------------

drop view if exists public.current_operational_offers;

create view public.current_operational_offers as
select
  po.id,
  po.farm_crop_id,

  fc.farm_id,
  fc.crop_name,

  f.name as farm_name,
  f.department_code,

  p.id as producer_id,
  -- Cuenta vinculada (solo para el backend: decide si hay mensajería interna).
  p.user_id as producer_user_id,

  coalesce(pp.business_name, p.name) as producer_name,
  coalesce(pp.verified, false) as producer_verified,
  coalesce(pp.contact_visible, false) as producer_contact_visible,

  -- Contacto público: NULL salvo que el productor lo haga visible.
  case when pp.contact_visible then pp.public_phone end as public_phone,
  case when pp.contact_visible then pp.public_email end as public_email,
  case when pp.contact_visible then pp.whatsapp end as whatsapp,

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

left join public.producer_profiles pp
  on pp.user_id = p.user_id

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

revoke all on public.current_operational_offers from anon, authenticated;

comment on view public.current_operational_offers is
  'Ofertas operativas vigentes. Sin email/teléfono legacy. Contacto solo si contact_visible. Solo backend.';

-- ------------------------------------------------------------
-- 2. CONVERSATIONS
-- ------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references public.profiles(id) on delete cascade,
  producer_user_id uuid not null references public.profiles(id) on delete cascade,
  offer_id uuid references public.production_offers(id) on delete set null,
  farm_id uuid references public.farms(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversations_status_check
    check (status in ('active', 'closed', 'archived')),

  -- Nadie conversa consigo mismo (aunque tenga ambos roles).
  constraint conversations_not_self_check
    check (buyer_user_id <> producer_user_id)
);

create index if not exists conversations_buyer_idx
  on public.conversations (buyer_user_id, updated_at desc);

create index if not exists conversations_producer_idx
  on public.conversations (producer_user_id, updated_at desc);

-- Una sola conversación activa por comprador, productor y oferta.
create unique index if not exists conversations_active_offer_uniq
  on public.conversations (buyer_user_id, producer_user_id, offer_id)
  where status = 'active' and offer_id is not null;

drop trigger if exists conversations_touch_updated_at on public.conversations;
create trigger conversations_touch_updated_at
  before update on public.conversations
  for each row execute function public.identity_touch_updated_at();

comment on table public.conversations is
  'Conversación interna comprador-productor con contexto de oferta y finca. Solo backend.';

-- ------------------------------------------------------------
-- 3. MESSAGES
-- Texto plano. El frontend lo renderiza como texto, nunca como HTML.
-- ------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,

  constraint messages_body_check
    check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

create index if not exists messages_unread_idx
  on public.messages (conversation_id)
  where read_at is null;

comment on table public.messages is
  'Mensajes de una conversación. body es texto plano. Solo backend.';

-- ------------------------------------------------------------
-- 4. RLS: activo, sin políticas. Solo backend (clave administrativa).
-- ------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;

commit;
