-- ============================================================
-- 016_fix_geo_rpc_conflict.sql
-- Corrige la ambigüedad de nombres en public.upsert_geo_unit_geojson.
--
-- Problema (004_geo_rpc.sql):
--   RETURNS TABLE declara columnas de salida llamadas `level` y `dane_code`.
--   Dentro del cuerpo, `ON CONFLICT (level, dane_code)` se resuelve contra esas variables de PL/pgSQL
--   y PostgreSQL responde: column reference "level" is ambiguous.
--   ON CONFLICT solo acepta nombres de columna (no calificados), así que no puede corregirse calificando.
--
-- Fix:
--   `#variable_conflict use_column` al inicio del cuerpo: en sentencias SQL, un nombre ambiguo
--   se resuelve como columna. Es la corrección más pequeña y no cambia firma, salida ni lógica.
--
-- Esta migración también reafirma la política de permisos de 015 (ejecutable solo por service_role),
-- para que sea segura se aplique antes o después de 015.
--
-- Requisitos:
--   - Ejecutar como dueño de la función (CREATE OR REPLACE lo exige).
--   - PostGIS instalado (001 lo crea en el esquema `extensions`).
-- Idempotente. No elimina ni modifica datos. NO se ejecuta automáticamente.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'postgis') then
    raise exception 'PostGIS no está instalado; 016 no puede aplicarse';
  end if;
end $$;

create or replace function public.upsert_geo_unit_geojson(
    p_level text,
    p_dane_code text,
    p_name text,
    p_parent_id uuid,
    p_source_id uuid,
    p_attributes jsonb,
    p_geojson jsonb
)
returns table(
    id uuid,
    level text,
    dane_code text,
    name text,
    geom geometry(MultiPolygon, 4326),
    centroid geometry(Point, 4326),
    parent_id uuid,
    source_id uuid
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
    v_geom geometry(MultiPolygon, 4326);
    v_centroid geometry(Point, 4326);
    v_id uuid;
begin
    -- Convertir GeoJSON a geometría, asegurando MultiPolygon
    if p_geojson is not null then
        v_geom := ST_Multi(ST_GeomFromGeoJSON(p_geojson))::geometry(MultiPolygon, 4326);
        -- Asegurar SRID
        v_geom := ST_SetSRID(v_geom, 4326);
        -- Punto sobre la superficie (garantizado dentro del territorio)
        v_centroid := ST_PointOnSurface(v_geom)::geometry(Point, 4326);
    end if;

    -- Upsert de geo_unit
    insert into geo_units(level, dane_code, name, parent_id, source_id, geom, centroid, attributes, created_at, updated_at)
    values (p_level, p_dane_code, p_name, p_parent_id, p_source_id, v_geom, v_centroid, p_attributes, now(), now())
    on conflict (level, dane_code)
    do update set
        name = p_name,
        parent_id = p_parent_id,
        source_id = p_source_id,
        geom = v_geom,
        centroid = v_centroid,
        attributes = p_attributes,
        updated_at = now()
    returning geo_units.id, geo_units.level, geo_units.dane_code, geo_units.name,
              geo_units.geom, geo_units.centroid, geo_units.parent_id, geo_units.source_id
    into id, level, dane_code, name, geom, centroid, parent_id, source_id;

    return next;
end;
$$;

-- Política de permisos (igual a 015): solo service_role ejecuta.
revoke execute on function public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb) from public;
revoke execute on function public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb) from anon;
revoke execute on function public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb) from authenticated;
grant execute on function public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb) to service_role;
