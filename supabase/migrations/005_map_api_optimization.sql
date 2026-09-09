-- ============================================================================
-- Sprint 03 - Migration 005
-- Map API optimization + Bogotá D.C. territorial treatment
--
-- geo_units remains the authoritative geographic source.
-- geo_units_map is ONLY a VIEW for optimized cartographic output.
--
-- NO duplicated geometry table.
-- NO synchronization trigger.
-- NO modification of original geo_units.geom.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. BOGOTÁ D.C. - IDEMPOTENT TERRITORIAL TREATMENT
-- ============================================================================

DO $$
DECLARE
    v_bogota_dept_id uuid;
    v_bogota_mun_id uuid;
BEGIN

    -- Existing first-level Bogotá entity, if already created.
    SELECT id
    INTO v_bogota_dept_id
    FROM public.geo_units
    WHERE level = 'department'
      AND dane_code = '11'
    LIMIT 1;

    -- Existing Bogotá municipality/district.
    SELECT id
    INTO v_bogota_mun_id
    FROM public.geo_units
    WHERE level = 'municipality'
      AND dane_code = '11001'
    LIMIT 1;

    -- If municipality 11001 exists but first-level entity 11 does not,
    -- derive it from the official geometry already stored for Bogotá.
    IF v_bogota_mun_id IS NOT NULL
       AND v_bogota_dept_id IS NULL THEN

        INSERT INTO public.geo_units (
            level,
            dane_code,
            name,
            parent_id,
            geom,
            centroid,
            attributes,
            source_id,
            created_at,
            updated_at
        )
        SELECT
            'department',
            '11',
            'Bogotá, D.C.',
            NULL,
            g.geom,
            g.centroid,
            jsonb_build_object(
                'territorial_type', 'capital_district',
                'derived_from_dane_code', '11001'
            ),
            g.source_id,
            now(),
            now()
        FROM public.geo_units g
        WHERE g.id = v_bogota_mun_id

        ON CONFLICT (level, dane_code)
        DO UPDATE SET
            name = EXCLUDED.name
        RETURNING id
        INTO v_bogota_dept_id;

    END IF;

    -- Defensive re-read in case entity already existed.
    IF v_bogota_dept_id IS NULL THEN
        SELECT id
        INTO v_bogota_dept_id
        FROM public.geo_units
        WHERE level = 'department'
          AND dane_code = '11'
        LIMIT 1;
    END IF;

    -- Ensure Bogotá first-level entity is top-level
    -- and has the expected metadata.
    IF v_bogota_dept_id IS NOT NULL THEN

        UPDATE public.geo_units
        SET
            parent_id = NULL,

            attributes =
                jsonb_set(
                    jsonb_set(
                        COALESCE(attributes, '{}'::jsonb),
                        '{territorial_type}',
                        to_jsonb('capital_district'::text),
                        true
                    ),
                    '{derived_from_dane_code}',
                    to_jsonb('11001'::text),
                    true
                ),

            updated_at = now()

        WHERE id = v_bogota_dept_id
          AND (
              parent_id IS NOT NULL
              OR attributes ->> 'territorial_type'
                    IS DISTINCT FROM 'capital_district'
              OR attributes ->> 'derived_from_dane_code'
                    IS DISTINCT FROM '11001'
          );

    END IF;

    -- Link municipality/district 11001 to territorial entity 11.
    IF v_bogota_mun_id IS NOT NULL
       AND v_bogota_dept_id IS NOT NULL THEN

        UPDATE public.geo_units
        SET
            parent_id = v_bogota_dept_id,

            attributes =
                jsonb_set(
                    COALESCE(attributes, '{}'::jsonb),
                    '{territorial_type}',
                    to_jsonb('capital_district_municipality'::text),
                    true
                ),

            updated_at = now()

        WHERE id = v_bogota_mun_id
          AND (
              parent_id IS DISTINCT FROM v_bogota_dept_id
              OR attributes ->> 'territorial_type'
                    IS DISTINCT FROM 'capital_district_municipality'
          );

    END IF;

    RAISE NOTICE
        'Bogotá D.C. treatment complete. first_level_id=%, municipality_id=%',
        v_bogota_dept_id,
        v_bogota_mun_id;

END
$$;

-- ============================================================================
-- 2. OPTIMIZED MAP VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.geo_units_map
WITH (security_invoker = true)
AS
SELECT
    g.id,
    g.level,
    g.dane_code,
    g.name,
    g.parent_id,

    CASE

        WHEN g.level = 'department'
             AND g.geom IS NOT NULL
        THEN
            extensions.ST_AsGeoJSON(
                extensions.ST_SimplifyPreserveTopology(
                    g.geom,
                    0.01
                )
            )::jsonb

        WHEN g.level = 'municipality'
             AND g.geom IS NOT NULL
        THEN
            extensions.ST_AsGeoJSON(
                extensions.ST_SimplifyPreserveTopology(
                    g.geom,
                    0.003
                )
            )::jsonb

        WHEN g.geom IS NOT NULL
        THEN
            extensions.ST_AsGeoJSON(g.geom)::jsonb

        ELSE NULL

    END AS geojson,

    CASE

        WHEN g.centroid IS NOT NULL
        THEN
            extensions.ST_AsGeoJSON(g.centroid)::jsonb

        ELSE NULL

    END AS centroid_geojson,

    g.created_at,
    g.updated_at

FROM public.geo_units g

WHERE g.geom IS NOT NULL;

COMMENT ON VIEW public.geo_units_map IS
'Optimized cartographic view over geo_units. Departments use ST_SimplifyPreserveTopology tolerance 0.01 degrees and municipalities 0.003 degrees. Original PostGIS geometries remain unchanged in geo_units.';

-- ============================================================================
-- 3. PERMISSIONS
-- ============================================================================

REVOKE ALL
ON public.geo_units_map
FROM PUBLIC;

REVOKE ALL
ON public.geo_units_map
FROM anon;

REVOKE ALL
ON public.geo_units_map
FROM authenticated;

GRANT SELECT
ON public.geo_units_map
TO service_role;

-- ============================================================================
-- 4. IDEMPOTENT AUDIT ENTRY
-- ============================================================================

INSERT INTO public.audit_log (
    table_name,
    action,
    changes
)
SELECT
    'migrations',
    '005_map_api_optimization',
    jsonb_build_object(
        'view_created', 'geo_units_map',
        'authoritative_source', 'geo_units',
        'simplification_departments', '0.01 degrees',
        'simplification_municipalities', '0.003 degrees',
        'bogota_dc', 'department/11 + municipality/11001',
        'security_invoker', true,
        'permissions', 'service_role only',
        'timestamp', now()::text
    )
WHERE NOT EXISTS (
    SELECT 1
    FROM public.audit_log
    WHERE table_name = 'migrations'
      AND action = '005_map_api_optimization'
);

-- Reload PostgREST metadata.
NOTIFY pgrst, 'reload schema';

COMMIT;