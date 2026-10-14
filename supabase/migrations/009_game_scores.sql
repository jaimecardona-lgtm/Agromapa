-- ============================================================
-- 009_game_scores.sql
-- Registro central de partidas de los minijuegos públicos.
--
-- Escritura y lectura pasan por el backend (FastAPI) con la clave
-- administrativa de Supabase. RLS queda activado SIN políticas para
-- los roles anon/authenticated: el frontend no puede escribir ni leer
-- esta tabla directamente.
-- ============================================================

create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  player_alias text,
  game_slug text not null,
  difficulty text,
  score integer not null,
  correct_answers integer,
  wrong_answers integer,
  best_streak integer,
  lives_remaining integer,
  duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint game_scores_slug_check
    check (game_slug in ('cosechas', 'eco-puzzle', 'cazadores-residuos')),

  constraint game_scores_difficulty_check
    check (difficulty is null or difficulty in ('basico', 'intermedio', 'avanzado', 'experto')),

  constraint game_scores_score_check
    check (score >= 0),

  constraint game_scores_correct_check
    check (correct_answers is null or correct_answers >= 0),

  constraint game_scores_wrong_check
    check (wrong_answers is null or wrong_answers >= 0),

  constraint game_scores_streak_check
    check (best_streak is null or best_streak >= 0),

  constraint game_scores_lives_check
    check (lives_remaining is null or lives_remaining between 0 and 3),

  constraint game_scores_duration_check
    check (duration_seconds is null or duration_seconds between 0 and 3600),

  constraint game_scores_alias_check
    check (player_alias is null or char_length(player_alias) between 1 and 40),

  constraint game_scores_metadata_check
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 2048)
);

create index if not exists game_scores_game_slug_idx
  on public.game_scores (game_slug);

create index if not exists game_scores_score_idx
  on public.game_scores (score);

create index if not exists game_scores_created_at_idx
  on public.game_scores (created_at);

create index if not exists game_scores_player_id_idx
  on public.game_scores (player_id);

-- Índice para clasificación: mejores puntajes por juego.
create index if not exists game_scores_leaderboard_idx
  on public.game_scores (game_slug, score desc, created_at asc);

-- Índice para clasificación filtrada por dificultad.
create index if not exists game_scores_leaderboard_difficulty_idx
  on public.game_scores (game_slug, difficulty, score desc, created_at asc);

alter table public.game_scores enable row level security;

comment on table public.game_scores is
  'Partidas de minijuegos públicos. Escritura solo vía backend (clave administrativa).';

comment on column public.game_scores.player_id is
  'Identificador anónimo generado en el navegador. No es una cuenta de usuario.';
