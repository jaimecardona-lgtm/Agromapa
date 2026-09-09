-- ============================================================================
-- Sprint 03 - Migration 007
-- Nuevo Belén de Bajirá (DANE 27493)
--
-- Context:
-- EVA 2024 contains agricultural statistics for DANE municipality 27493,
-- while the original AgroMapa geographic synchronization did not contain
-- this territorial entity.
--
-- Decision:
-- Register the municipality in geo_units without inventing geometry.
-- Geometry and centroid remain NULL until an authoritative geographic
-- source is integrated.
--
-- The territorial existence/name provenance for this row is EVA.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. VERIFY REQUIRED REFERENCES
-- ============================================================================

DO $$
DECLARE
    v_department_id uuid;
    v_eva_source_id uuid;
BEGIN

    SELECT id
    INTO v_department_id
    FROM public.geo_units
    WHERE level = 'department'
      AND dane_code = '27'
    LIMIT 1;

    IF v_department_id IS NULL THEN
        RAISE EXCEPTION
            'Chocó department (DANE 27) was not found in geo_units.';
    END IF;

    SELECT id
    INTO v_eva_source_id
    FROM public.data_sources
    WHERE source_key = 'upra_eva'
    LIMIT 1;

    IF v_eva_source_id IS NULL THEN
        RAISE EXCEPTION
            'Data source upra_eva was not found in data_sources.';
    END IF;

END
$$;

-- ============================================================================
-- 2. INSERT / UPDATE MUNICIPALITY 27493
-- ============================================================================

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
    'municipality',
    '27493',
    'Nuevo Belén de Bajirá',

    d.id,

    -- IMPORTANT:
    -- Do not fabricate coordinates or boundaries.
    NULL,
    NULL,

    jsonb_build_object(
        'territorial_type', 'municipality',
        'geometry_status', 'pending_official_geometry',
        'created_after_original_geo_sync', true,
        'detected_in_eva_year', 2024,
        'provenance', 'upra_eva'
    ),

    s.id,

    now(),
    now()

FROM public.geo_units d
CROSS JOIN public.data_sources s

WHERE d.level = 'department'
  AND d.dane_code = '27'
  AND s.source_key = 'upra_eva'

ON CONFLICT (level, dane_code)
DO UPDATE SET

    name = EXCLUDED.name,

    parent_id = EXCLUDED.parent_id,

    -- Never overwrite an existing geometry.
    -- If authoritative geometry is added later, re-running this migration
    -- must preserve it.
    attributes =
        COALESCE(public.geo_units.attributes, '{}'::jsonb)
        ||
        jsonb_build_object(
            'territorial_type', 'municipality',
            'created_after_original_geo_sync', true,
            'detected_in_eva_year', 2024,
            'provenance', 'upra_eva',
            'geometry_status',
                CASE
                    WHEN public.geo_units.geom IS NULL
                        THEN 'pending_official_geometry'
                    ELSE 'available'
                END
        ),

    source_id =
        COALESCE(
            public.geo_units.source_id,
            EXCLUDED.source_id
        ),

    updated_at = now();

-- ============================================================================
-- 3. AUDIT ENTRY
-- ============================================================================

INSERT INTO public.audit_log (
    table_name,
    action,
    changes
)
SELECT
    'geo_units',
    '007_nuevo_belen_bajira',

    jsonb_build_object(
        'dane_code', '27493',
        'name', 'Nuevo Belén de Bajirá',
        'department_dane', '27',
        'department_name', 'Chocó',
        'level', 'municipality',
        'geometry_status', 'pending_official_geometry',
        'geometry_action', 'no geometry fabricated',
        'detected_in_eva_year', 2024,
        'source_key', 'upra_eva',
        'timestamp', now()::text
    )

WHERE NOT EXISTS (
    SELECT 1
    FROM public.audit_log
    WHERE table_name = 'geo_units'
      AND action = '007_nuevo_belen_bajira'
);

-- ============================================================================
-- 4. RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;