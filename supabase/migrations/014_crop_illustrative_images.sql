-- ============================================================
-- 014_crop_illustrative_images.sql
-- Imágenes ILUSTRATIVAS generadas por IA, guardadas por cultivo (farm_crops).
--
-- Una imagen generada NO es evidencia fotográfica real de la finca.
-- La interfaz debe etiquetarla siempre como "Imagen ilustrativa generada por IA".
--
-- Idempotente: se puede ejecutar más de una vez. No modifica datos existentes
-- (las filas actuales quedan con status 'none') y no toca 009–013.
-- NO se ejecuta automáticamente: aplicar manualmente tras revisión.
-- ============================================================

alter table public.farm_crops
  add column if not exists illustrative_image_url text,
  add column if not exists illustrative_image_status text not null default 'none',
  add column if not exists illustrative_image_generated_at timestamptz,
  add column if not exists illustrative_image_prompt_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farm_crops_illustrative_status_check'
  ) then
    alter table public.farm_crops
      add constraint farm_crops_illustrative_status_check
      check (illustrative_image_status in ('none', 'pending', 'ready', 'failed'));
  end if;
end $$;

comment on column public.farm_crops.illustrative_image_url is
  'URL pública de la imagen ilustrativa generada por IA (bucket crop-illustrations). No es foto real.';

comment on column public.farm_crops.illustrative_image_status is
  'none | pending | ready | failed. Una vez ready no se regenera automáticamente.';
