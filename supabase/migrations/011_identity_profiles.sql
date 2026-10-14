-- ============================================================
-- 011_identity_profiles.sql
-- Raíces Conectadas: identidad global de usuarios.
--
-- Autenticación: Supabase Auth (auth.users).
-- Esta migración crea el perfil de la plataforma y sus roles:
--   profiles          -> datos personales/territoriales (1 por auth.users)
--   user_roles        -> roles activos: producer | buyer (una cuenta puede tener ambos)
--   producer_profiles -> datos públicos opcionales del productor
--   buyer_profiles    -> datos públicos opcionales del comprador
--
-- Acceso: solo backend FastAPI (clave administrativa). RLS activo SIN
-- políticas para anon/authenticated: el frontend no lee ni escribe
-- estas tablas directamente.
--
-- Additive / idempotente. No modifica tablas ni migraciones anteriores.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. PROFILES
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Usuario',
  country_code text not null default 'CO',
  department_code text,
  municipality_code text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_display_name_check
    check (char_length(display_name) between 1 and 120),

  constraint profiles_country_code_check
    check (country_code ~ '^[A-Z]{2}$'),

  -- Códigos DANE: departamento (2 dígitos) y municipio (5 dígitos).
  constraint profiles_department_code_check
    check (department_code is null or department_code ~ '^[0-9]{2}$'),

  constraint profiles_municipality_code_check
    check (municipality_code is null or municipality_code ~ '^[0-9]{5}$'),

  constraint profiles_avatar_url_check
    check (avatar_url is null or char_length(avatar_url) <= 500)
);

create index if not exists profiles_territory_idx
  on public.profiles (department_code, municipality_code);

comment on table public.profiles is
  'Perfil de la plataforma por usuario de Supabase Auth. Acceso solo vía backend.';

-- ------------------------------------------------------------
-- 2. USER ROLES
-- Roles limitados a producer y buyer. Admin NO es un rol de registro.
-- ------------------------------------------------------------

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),

  primary key (user_id, role),

  constraint user_roles_role_check
    check (role in ('producer', 'buyer'))
);

create index if not exists user_roles_role_idx
  on public.user_roles (role);

comment on table public.user_roles is
  'Roles activos del usuario: producer, buyer. Pueden coexistir y activarse/desactivarse.';

-- ------------------------------------------------------------
-- 3. PRODUCER PROFILES
-- ------------------------------------------------------------

create table if not exists public.producer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  business_name text,
  description text,
  public_phone text,
  public_email text,
  whatsapp text,
  contact_visible boolean not null default false,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint producer_profiles_business_name_check
    check (business_name is null or char_length(business_name) <= 150),

  constraint producer_profiles_description_check
    check (description is null or char_length(description) <= 2000)
);

comment on table public.producer_profiles is
  'Datos públicos del productor. verified solo lo cambia un proceso administrativo.';

-- ------------------------------------------------------------
-- 4. BUYER PROFILES
-- ------------------------------------------------------------

create table if not exists public.buyer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization text,
  description text,
  public_phone text,
  public_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint buyer_profiles_organization_check
    check (organization is null or char_length(organization) <= 150),

  constraint buyer_profiles_description_check
    check (description is null or char_length(description) <= 2000)
);

comment on table public.buyer_profiles is
  'Datos del comprador. Chat y contactos se añadirán en fases posteriores.';

-- ------------------------------------------------------------
-- 5. UPDATED_AT
-- ------------------------------------------------------------

create or replace function public.identity_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.identity_touch_updated_at();

drop trigger if exists producer_profiles_touch_updated_at on public.producer_profiles;
create trigger producer_profiles_touch_updated_at
  before update on public.producer_profiles
  for each row execute function public.identity_touch_updated_at();

drop trigger if exists buyer_profiles_touch_updated_at on public.buyer_profiles;
create trigger buyer_profiles_touch_updated_at
  before update on public.buyer_profiles
  for each row execute function public.identity_touch_updated_at();

-- ------------------------------------------------------------
-- 6. RLS: activo, sin políticas. Solo backend (service role).
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.producer_profiles enable row level security;
alter table public.buyer_profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;
revoke all on public.producer_profiles from anon, authenticated;
revoke all on public.buyer_profiles from anon, authenticated;

commit;
