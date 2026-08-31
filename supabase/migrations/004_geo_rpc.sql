-- RPC function to safely upsert geographic units with geometry

CREATE OR REPLACE FUNCTION public.upsert_geo_unit_geojson(
    p_level text,
    p_dane_code text,
    p_name text,
    p_parent_id uuid,
    p_source_id uuid,
    p_attributes jsonb,
    p_geojson jsonb
)
RETURNS TABLE(
    id uuid,
    level text,
    dane_code text,
    name text,
    geom geometry(MultiPolygon, 4326),
    centroid geometry(Point, 4326),
    parent_id uuid,
    source_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_geom geometry(MultiPolygon, 4326);
    v_centroid geometry(Point, 4326);
    v_id uuid;
BEGIN
    -- Convert GeoJSON to geometry, ensuring MultiPolygon type
    IF p_geojson IS NOT NULL THEN
        v_geom := ST_Multi(ST_GeomFromGeoJSON(p_geojson))::geometry(MultiPolygon, 4326);
        -- Ensure SRID is set
        v_geom := ST_SetSRID(v_geom, 4326);
        -- Calculate point on surface (guaranteed to be within territory)
        v_centroid := ST_PointOnSurface(v_geom)::geometry(Point, 4326);
    END IF;

    -- Upsert geo_unit
    INSERT INTO geo_units(level, dane_code, name, parent_id, source_id, geom, centroid, attributes, created_at, updated_at)
    VALUES (p_level, p_dane_code, p_name, p_parent_id, p_source_id, v_geom, v_centroid, p_attributes, now(), now())
    ON CONFLICT (level, dane_code)
    DO UPDATE SET
        name = p_name,
        parent_id = p_parent_id,
        source_id = p_source_id,
        geom = v_geom,
        centroid = v_centroid,
        attributes = p_attributes,
        updated_at = now()
    RETURNING geo_units.id, geo_units.level, geo_units.dane_code, geo_units.name,
              geo_units.geom, geo_units.centroid, geo_units.parent_id, geo_units.source_id
    INTO id, level, dane_code, name, geom, centroid, parent_id, source_id;

    RETURN NEXT;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.upsert_geo_unit_geojson(text, text, text, uuid, uuid, jsonb, jsonb) TO authenticated, anon;
