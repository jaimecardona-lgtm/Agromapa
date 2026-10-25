-- ============================================================
-- 015_secure_geo_rpc.sql
-- Cierra la escritura pública sobre geo_units a través de upsert_geo_unit_geojson.
--
-- Contexto (004_geo_rpc.sql):
--   - La función es SECURITY DEFINER: se ejecuta con los permisos de su dueño y evita RLS.
--   - 004 concedió EXECUTE a authenticated y anon, y PostgreSQL concede EXECUTE a PUBLIC por defecto.
--     Cualquier visitante con la clave anon (pública en el frontend) podía escribir territorios.
--   - El backend la llama con SUPABASE_SECRET_KEY (rol service_role). Ese rol necesita EXECUTE explícito
--     una vez que se revoca PUBLIC.
--   - La función no fija search_path. Como SECURITY DEFINER, fijarlo evita que un invocador
--     redirija nombres sin calificar (geo_units, ST_*) a objetos de otro esquema.
--
-- Cambios:
--   1. REVOKE EXECUTE de PUBLIC, anon y authenticated.
--   2. GRANT EXECUTE solo a service_role (usado por el backend).
--   3. search_path fijado a esquemas conocidos. La lógica del RPC no cambia.
--
-- Aditiva y segura: no elimina ni modifica filas. Idempotente: se puede aplicar varias veces.
-- NO se ejecuta automáticamente. Aplicar manualmente tras revisión.
-- ============================================================

-- Falla de forma explícita si la firma no coincide con 004 (no se aplica nada a medias).
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'upsert_geo_unit_geojson'
      and pg_get_function_identity_arguments(p.oid) =
          'p_level text, p_dane_code text, p_name text, p_parent_id uuid, p_source_id uuid, p_attributes jsonb, p_geojson jsonb'
  ) then
    raise exception 'upsert_geo_unit_geojson con la firma esperada no existe; revisar 004 antes de aplicar 015';
  end if;
end $$;

revoke execute on function public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb) from public;
revoke execute on function public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb) from anon;
revoke execute on function public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb) from authenticated;

grant execute on function public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb) to service_role;

alter function public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb)
  set search_path = public, extensions, pg_temp;

-- Verificación post-aplicación (solo lectura). Esperado: anon=false, authenticated=false, service_role=true.
-- select
--   has_function_privilege('anon',          'public.upsert_geo_unit_geojson(text,text,text,uuid,uuid,jsonb,jsonb)', 'EXECUTE') as anon,
--   has_function_privilege('authenticated', 'public.upsert_geo_unit_geojson(text,text,text,uuid,uuid,jsonb,jsonb)', 'EXECUTE') as authenticated,
--   has_function_privilege('service_role',  'public.upsert_geo_unit_geojson(text,text,text,uuid,uuid,jsonb,jsonb)', 'EXECUTE') as service_role;
