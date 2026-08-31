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
        """Upsert a geographic unit."""

        if not supabase_service.is_configured():
            raise RuntimeError("Supabase not configured")

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        # Build geometry SQL if provided
        geom_sql = "NULL"
        if geojson_geometry:
            geom_sql = f"ST_GeomFromGeoJSON('{geojson_geometry}'::json)"

        centroid_sql = "NULL"
        if centroid_geojson:
            centroid_sql = f"ST_GeomFromGeoJSON('{centroid_geojson}'::json)"

        # Use Postgrest upsert
        data = {
            "level": level,
            "dane_code": dane_code,
            "name": name,
            "parent_id": parent_id,
            "source_id": source_id,
            "attributes": attributes,
        }

        try:
            response = client.table("geo_units").upsert(
                data,
                on_conflict="level,dane_code",
            ).execute()

            logger.info(f"Upserted geo_unit: {level}/{dane_code}/{name}")
            return response.data[0] if response.data else {}

        except Exception as e:
            logger.error(f"Failed to upsert geo_unit: {str(e)}")
            raise

    async def get_departments(self) -> list[dict]:
        """Get all departments."""

        if not supabase_service.is_configured():
            return []

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = client.table("geo_units").select("*").eq("level", "department").execute()
            return response.data

        except Exception as e:
            logger.error(f"Failed to get departments: {str(e)}")
            return []

    async def get_municipalities_by_department(self, department_dane_code: str) -> list[dict]:
        """Get municipalities for a department."""

        if not supabase_service.is_configured():
            return []

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            # First get the department
            dept_response = client.table("geo_units").select("id").eq("level", "department").eq(
                "dane_code", department_dane_code
            ).single().execute()

            department_id = dept_response.data["id"]

            # Then get municipalities
            response = (
                client.table("geo_units")
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
                client.table("geo_units")
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

    async def get_all_by_level(self, level: str) -> list[dict]:
        """Get all geo units by level for bulk operations."""

        if not supabase_service.is_configured():
            return []

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = client.table("geo_units").select("id, level, dane_code, name").eq("level", level).execute()
            logger.info(f"Loaded {len(response.data)} geo units for level: {level}")
            return response.data

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
