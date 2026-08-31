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
        area_planted_ha: Optional[float] = None,
        area_harvested_ha: Optional[float] = None,
        production_tons: Optional[float] = None,
        yield_t_ha: Optional[float] = None,
        crop_group: Optional[str] = None,
        crop_subgroup: Optional[str] = None,
        period: Optional[str] = None,
        source_id: Optional[str] = None,
        raw_data: Optional[dict] = None,
    ) -> dict:
        """Upsert an agricultural statistic."""

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
            "period": period,
            "source_id": source_id,
            "raw_data": raw_data,
        }

        try:
            response = client.table("agricultural_stats").upsert(
                data,
                on_conflict="geo_unit_id,year,crop_name,source_id",
            ).execute()

            logger.info(f"Upserted ag_stat: {geo_unit_id}/{year}/{crop_name}")
            return response.data[0] if response.data else {}

        except Exception as e:
            logger.error(f"Failed to upsert agricultural stat: {str(e)}")
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
