-- ============================================================
-- 012_identity_links.sql
-- Raíces Conectadas: vínculos entre identidad y modelo operacional/juegos.
--
--   producers.user_id       -> profiles.id (nullable, único)
--                              Un productor autenticado tiene exactamente un
--                              registro de producers. Los registros históricos
--                              y demo quedan con user_id NULL.
--   game_scores.user_id     -> auth.users.id (nullable)
--                              NULL = partida de invitado (player_id del navegador).
--   guest_score_claims      -> reclamo único de un player_id de invitado por cuenta.
--                              Evita que un mismo player_id se vincule a dos cuentas.
--
-- Additive / idempotente. No renombra ni elimina producers, farms,
-- farm_crops, production_offers ni game_scores.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. PRODUCERS -> PROFILES
-- Legacy producers keep user_id NULL. They are NOT claimed automatically;
-- an administrator links them manually if they belong to a real account.
-- ------------------------------------------------------------

alter table public.producers
  add column if not exists user_id uuid
    references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'producers_user_id_key'
      and conrelid = 'public.producers'::regclass
  ) then
    alter table public.producers
      add constraint producers_user_id_key unique (user_id);
  end if;
end
$$;

comment on column public.producers.user_id is
  'Cuenta de Supabase Auth (profiles.id) dueña de este registro productor. NULL en registros históricos.';

-- ------------------------------------------------------------
-- 2. GAME SCORES -> AUTH USER
-- player_id is kept untouched (guest identity). user_id is set only for
-- registered players, from the validated token (never from the request body).
-- ------------------------------------------------------------

alter table public.game_scores
  add column if not exists user_id uuid
    references auth.users(id) on delete set null;

create index if not exists game_scores_user_id_idx
  on public.game_scores (user_id);

create index if not exists game_scores_user_leaderboard_idx
  on public.game_scores (user_id, game_slug, score desc, created_at asc);

comment on column public.game_scores.user_id is
  'Cuenta registrada dueña de la partida. NULL = invitado (solo player_id del navegador).';

-- ------------------------------------------------------------
-- 3. GUEST SCORE CLAIMS
-- One row per guest player_id once it has been linked to an account.
-- Primary key on player_id makes the first claim win; later claims by a
-- different account are rejected by the backend.
-- ------------------------------------------------------------

create table if not exists public.guest_score_claims (
  player_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

create index if not exists guest_score_claims_user_id_idx
  on public.guest_score_claims (user_id);

alter table public.guest_score_claims enable row level security;
revoke all on public.guest_score_claims from anon, authenticated;

comment on table public.guest_score_claims is
  'Vínculo único player_id de invitado -> cuenta. Solo backend.';

commit;
