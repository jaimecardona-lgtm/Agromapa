"""Repository for geographic units."""

import logging
from typing import Optional

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


class GeoRepository:
    """Repository for geo_units table operations."""

    async def upsert_geo_unit(
        self,
        level: str,
        dane_code: str,
        name: str,
        geojson_geometry: Optional[dict] = None,
        centroid_geojson: Optional[dict] = None,
        parent_id: Optional[str] = None,
        source_id: Optional[str] = None,
        attributes: Optional[dict] = None,
    ) -> dict:
        """Upsert a geographic unit via RPC with geometry handling."""

        if not supabase_service.is_configured():
            raise RuntimeError("Supabase not configured")

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = client.rpc(
                "upsert_geo_unit_geojson",
                {
                    "p_level": level,
                    "p_dane_code": dane_code,
                    "p_name": name,
                    "p_parent_id": parent_id,
                    "p_source_id": source_id,
                    "p_attributes": attributes,
                    "p_geojson": geojson_geometry,
                },
            ).execute()

            logger.info(f"Upserted geo_unit: {level}/{dane_code}/{name}")
            return response.data[0] if response.data else {}

        except Exception as e:
            logger.error(f"Failed to upsert geo_unit: {str(e)}")
            raise

    async def get_departments(self) -> list[dict]:
        """Get all departments with GeoJSON geometry."""

        if not supabase_service.is_configured():
            return []

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = client.table("geo_units_api").select("*").eq("level", "department").execute()
            return response.data

        except Exception as e:
            logger.error(f"Failed to get departments: {str(e)}")
            return []

    async def get_municipalities_by_department(self, department_dane_code: str) -> list[dict]:
        """Get municipalities for a department with GeoJSON geometry."""

        if not supabase_service.is_configured():
            return []

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            # First get the department
            dept_response = (
                client.table("geo_units_api")
                .select("id")
                .eq("level", "department")
                .eq("dane_code", department_dane_code)
                .limit(1)
                .execute()
            )

            if not dept_response.data:
                logger.warning(f"Department not found: {department_dane_code}")
                return []

            department_id = dept_response.data[0]["id"]

            # Then get municipalities
            response = (
                client.table("geo_units_api")
                .select("*")
                .eq("level", "municipality")
                .eq("parent_id", department_id)
                .execute()
            )

            return response.data

        except Exception as e:
            logger.error(f"Failed to get municipalities: {str(e)}")
            return []

    async def get_by_dane_code(self, level: str, dane_code: str) -> Optional[dict]:
        """Get geo unit by level and DANE code."""

        if not supabase_service.is_configured():
            return None

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = (
                client.table("geo_units_api")
                .select("*")
                .eq("level", level)
                .eq("dane_code", dane_code)
                .limit(1)
                .execute()
            )

            if response.data:
                return response.data[0]
            return None

        except Exception as e:
            logger.debug(f"Geo unit not found: {level}/{dane_code} - {str(e)}")
            return None

    async def get_all_by_level(self, level: str, include_geometry: bool = False) -> list[dict]:
        """
        Get all geo units by level for bulk operations.

        Implements pagination to handle >1000 records (PostgREST default limit).
        Reuses single client for efficiency.
        """

        if not supabase_service.is_configured():
            return []

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)
        all_results = []
        page_size = 1000

        try:
            page = 0
            while True:
                offset = page * page_size
                range_start = offset
                range_end = offset + page_size - 1

                if include_geometry:
                    response = (
                        client.table("geo_units_api")
                        .select("*")
                        .eq("level", level)
                        .range(range_start, range_end)
                        .execute()
                    )
                else:
                    response = (
                        client.table("geo_units")
                        .select("id, level, dane_code, name, parent_id")
                        .eq("level", level)
                        .range(range_start, range_end)
                        .execute()
                    )

                if not response.data:
                    break

                all_results.extend(response.data)
                page += 1

                # If fewer than page_size results, we've reached the end
                if len(response.data) < page_size:
                    break

            logger.info(f"Loaded {len(all_results)} geo units for level: {level} (pages: {page})")
            return all_results

        except Exception as e:
            logger.error(f"Failed to get geo units by level: {str(e)}")
            return []

    async def count_by_level(self, level: str) -> int:
        """Count geo units by level."""

        if not supabase_service.is_configured():
            return 0

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = client.table("geo_units").select("id", count="exact").eq("level", level).execute()
            return response.count or 0

        except Exception as e:
            logger.error(f"Failed to count geo units: {str(e)}")
            return 0
