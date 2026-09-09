"""Repository for agricultural statistics."""

import logging
from typing import Optional

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


class AgricultureRepository:
    """Repository for agricultural_stats table operations."""

    async def upsert_stat(
        self,
        geo_unit_id: str,
        year: int,
        crop_name: str,
        source_id: str,
        source_record_key: str,
        area_planted_ha: Optional[float] = None,
        area_harvested_ha: Optional[float] = None,
        production_tons: Optional[float] = None,
        yield_t_ha: Optional[float] = None,
        crop_group: Optional[str] = None,
        crop_subgroup: Optional[str] = None,
        crop_cycle: Optional[str] = None,
        crop_code: Optional[str] = None,
        crop_disaggregation: Optional[str] = None,
        crop_physical_state: Optional[str] = None,
        crop_scientific_name: Optional[str] = None,
        period: Optional[str] = None,
        raw_data: Optional[dict] = None,
    ) -> dict:
        """
        Upsert an agricultural statistic.

        Uses (source_id, source_record_key) as deduplication key.
        source_record_key is SHA-256 (64 hexadecimal characters) ensuring deterministic uniqueness.
        """

        if not supabase_service.is_configured():
            raise RuntimeError("Supabase not configured")

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        data = {
            "geo_unit_id": geo_unit_id,
            "year": year,
            "crop_name": crop_name,
            "area_planted_ha": area_planted_ha,
            "area_harvested_ha": area_harvested_ha,
            "production_tons": production_tons,
            "yield_t_ha": yield_t_ha,
            "crop_group": crop_group,
            "crop_subgroup": crop_subgroup,
            "crop_cycle": crop_cycle,
            "crop_code": crop_code,
            "crop_disaggregation": crop_disaggregation,
            "crop_physical_state": crop_physical_state,
            "crop_scientific_name": crop_scientific_name,
            "period": period,
            "source_id": source_id,
            "source_record_key": source_record_key,
            "raw_data": raw_data,
        }

        try:
            response = client.table("agricultural_stats").upsert(
                data,
                on_conflict="source_id,source_record_key",
            ).execute()

            logger.info(f"Upserted ag_stat: {geo_unit_id}/{year}/{crop_code}/{source_record_key}")
            return response.data[0] if response.data else {}

        except Exception as e:
            logger.error(f"Failed to upsert agricultural stat: {str(e)}")
            raise

    async def bulk_upsert_stats(
        self,
        records: list[dict],
        batch_size: int = 500,
    ) -> dict:
        """
        Bulk upsert agricultural statistics.

        Processes records in batches to avoid overwhelming Supabase.
        Reuses single client for efficiency.

        Args:
            records: List of record dicts with all agricultural_stats fields
            batch_size: Number of records per batch (default 500)

        Returns:
            Dict with total_processed, total_created, errors
        """

        if not supabase_service.is_configured():
            raise RuntimeError("Supabase not configured")

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        total_processed = 0
        total_created = 0
        errors = []

        try:
            for i in range(0, len(records), batch_size):
                batch = records[i : i + batch_size]

                try:
                    response = client.table("agricultural_stats").upsert(
                        batch,
                        on_conflict="source_id,source_record_key",
                    ).execute()

                    created = len(response.data) if response.data else 0
                    total_processed += len(batch)
                    total_created += created

                    logger.info(
                        f"Bulk upsert batch {i // batch_size + 1}: "
                        f"processed={len(batch)}, created={created}"
                    )

                except Exception as e:
                    error_msg = f"Batch {i // batch_size + 1} failed: {str(e)}"
                    logger.error(error_msg)
                    errors.append(error_msg)

            logger.info(
                f"Bulk upsert completed: total_processed={total_processed}, "
                f"total_created={total_created}, errors={len(errors)}"
            )

            return {
                "total_processed": total_processed,
                "total_created": total_created,
                "errors": errors,
            }

        except Exception as e:
            logger.error(f"Bulk upsert failed: {str(e)}")
            raise

    async def get_by_municipality_and_year(self, municipality_id: str, year: int) -> list[dict]:
        """Get agricultural stats for a municipality and year."""

        if not supabase_service.is_configured():
            return []

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = (
                client.table("agricultural_stats")
                .select("*")
                .eq("geo_unit_id", municipality_id)
                .eq("year", year)
                .execute()
            )

            return response.data

        except Exception as e:
            logger.error(f"Failed to get agricultural stats: {str(e)}")
            return []

    async def count_by_source(self, source_id: str) -> int:
        """Count agricultural stats by source."""

        if not supabase_service.is_configured():
            return 0

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = (
                client.table("agricultural_stats")
                .select("id", count="exact")
                .eq("source_id", source_id)
                .execute()
            )

            return response.count or 0

        except Exception as e:
            logger.error(f"Failed to count agricultural stats: {str(e)}")
            return 0
