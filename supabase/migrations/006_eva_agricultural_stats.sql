-- ============================================================================
-- Sprint 03 - Migration 006
-- EVA Agricultural Statistics
--
-- Validated against EVA 2024:
-- 25,553 records
-- 25,553 unique natural keys
--
-- Natural identity:
-- municipality_dane
-- + year
-- + period
-- + crop_cycle
-- + crop_code
-- + crop_disaggregation
--
-- Backend converts this canonical identity to a full SHA-256
-- source_record_key (64 hexadecimal characters).
--
-- Database deduplication:
-- UNIQUE (source_id, source_record_key)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXTEND AGRICULTURAL_STATS WITH REAL EVA DIMENSIONS
-- ============================================================================

ALTER TABLE public.agricultural_stats
    ADD COLUMN IF NOT EXISTS period text,
    ADD COLUMN IF NOT EXISTS crop_cycle text,
    ADD COLUMN IF NOT EXISTS crop_code text,
    ADD COLUMN IF NOT EXISTS crop_disaggregation text,
    ADD COLUMN IF NOT EXISTS crop_physical_state text,
    ADD COLUMN IF NOT EXISTS crop_scientific_name text,
    ADD COLUMN IF NOT EXISTS source_record_key text;

-- ============================================================================
-- 2. COLUMN DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN public.agricultural_stats.period IS
'EVA reporting period. Examples: 2024, 2024A, 2024B.';

COMMENT ON COLUMN public.agricultural_stats.crop_cycle IS
'EVA crop cycle classification, for example Transitorio or Permanente.';

COMMENT ON COLUMN public.agricultural_stats.crop_code IS
'Official EVA crop identifier. Stored as text to preserve the source representation.';

COMMENT ON COLUMN public.agricultural_stats.crop_disaggregation IS
'EVA detailed crop disaggregation associated with the official crop code.';

COMMENT ON COLUMN public.agricultural_stats.crop_physical_state IS
'EVA physical state of the crop when supplied by the source.';

COMMENT ON COLUMN public.agricultural_stats.crop_scientific_name IS
'Scientific crop name supplied by EVA when available.';

COMMENT ON COLUMN public.agricultural_stats.source_record_key IS
'Full SHA-256 hexadecimal hash (64 characters) generated from canonical EVA identity: municipality_dane, year, period, crop_cycle, crop_code, crop_disaggregation.';

-- ============================================================================
-- 3. REMOVE OBSOLETE UNIQUENESS MODEL
-- ============================================================================

-- Old schema assumed:
-- municipality + year + crop_name + source
--
-- EVA contains multiple valid records for the same crop name
-- because period, crop_code and other source dimensions matter.

ALTER TABLE public.agricultural_stats
DROP CONSTRAINT IF EXISTS
agricultural_stats_geo_unit_id_year_crop_name_source_id_key;

-- Defensive cleanup in case an earlier experimental migration was applied.
DROP INDEX IF EXISTS public.idx_ag_stats_unique_eva;

-- Remove an older/partial version of the key index if present.
DROP INDEX IF EXISTS public.idx_ag_stats_source_record_key;

-- ============================================================================
-- 4. AUTHORITATIVE EVA DEDUPLICATION INDEX
-- ============================================================================

-- IMPORTANT:
-- This index is intentionally NOT partial.
--
-- That allows Postgres/PostgREST to infer:
--
-- ON CONFLICT (source_id, source_record_key)
--
-- directly from the unique index.

CREATE UNIQUE INDEX idx_ag_stats_source_record_key
ON public.agricultural_stats (
    source_id,
    source_record_key
);

-- ============================================================================
-- 5. SUPPORTING QUERY INDEXES
-- ============================================================================

DROP INDEX IF EXISTS public.idx_ag_stats_source_record_key_lookup;

CREATE INDEX idx_ag_stats_source_record_key_lookup
ON public.agricultural_stats (
    source_record_key
)
WHERE source_record_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ag_stats_geo_year
ON public.agricultural_stats (
    geo_unit_id,
    year
);

CREATE INDEX IF NOT EXISTS idx_ag_stats_crop_code
ON public.agricultural_stats (
    crop_code
);

CREATE INDEX IF NOT EXISTS idx_ag_stats_period
ON public.agricultural_stats (
    period
);

-- ============================================================================
-- 6. TABLE DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.agricultural_stats IS
'Agricultural production statistics from EVA (Evaluaciones Agropecuarias Municipales). Records preserve official crop codes, period, crop cycle, crop disaggregation, areas, production, yield and original raw source data. EVA deduplication uses UNIQUE(source_id, source_record_key), where source_record_key is a full SHA-256 generated by the backend from the validated canonical EVA identity.';

-- ============================================================================
-- 7. IDEMPOTENT AUDIT ENTRY
-- ============================================================================

INSERT INTO public.audit_log (
    table_name,
    action,
    changes
)
SELECT
    'migrations',
    '006_eva_agricultural_stats',
    jsonb_build_object(

        'new_columns',
        jsonb_build_array(
            'period',
            'crop_cycle',
            'crop_code',
            'crop_disaggregation',
            'crop_physical_state',
            'crop_scientific_name',
            'source_record_key'
        ),

        'natural_key',
        jsonb_build_array(
            'municipality_dane',
            'year',
            'period',
            'crop_cycle',
            'crop_code',
            'crop_disaggregation'
        ),

        'deduplication',
        'UNIQUE(source_id, source_record_key)',

        'source_record_key',
        'full SHA-256 hexadecimal digest (64 chars)',

        'eva_2024_validation',
        jsonb_build_object(
            'records', 25553,
            'unique_keys', 25553,
            'duplicates', 0
        ),

        'old_constraint_removed',
        'agricultural_stats_geo_unit_id_year_crop_name_source_id_key',

        'timestamp',
        now()::text
    )

WHERE NOT EXISTS (
    SELECT 1
    FROM public.audit_log
    WHERE table_name = 'migrations'
      AND action = '006_eva_agricultural_stats'
);

-- Reload PostgREST metadata.
NOTIFY pgrst, 'reload schema';

COMMIT;