"""Repository for farms."""

import logging
from typing import Optional

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


class FarmRepository:
    """Repository for farms table operations."""

    async def create_farm(
        self,
        name: str,
        municipality_id: str,
        latitude: float,
        longitude: float,
        description: Optional[str] = None,
        corregimiento_name: Optional[str] = None,
        vereda_name: Optional[str] = None,
        producer_name: Optional[str] = None,
        producer_contact: Optional[str] = None,
        source_id: Optional[str] = None,
    ) -> dict:
        """Create a new farm."""

        if not supabase_service.is_configured():
            raise RuntimeError("Supabase not configured")

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        data = {
            "name": name,
            "municipality_id": municipality_id,
            "latitude": latitude,
            "longitude": longitude,
            "description": description,
            "corregimiento_name": corregimiento_name,
            "vereda_name": vereda_name,
            "producer_name": producer_name,
            "producer_contact": producer_contact,
            "source_id": source_id,
        }

        try:
            response = client.table("farms").insert(data).execute()
            logger.info(f"Created farm: {name}")
            return response.data[0] if response.data else {}

        except Exception as e:
            logger.error(f"Failed to create farm: {str(e)}")
            raise

    async def get_by_municipality(self, municipality_id: str) -> list[dict]:
        """Get farms by municipality."""

        if not supabase_service.is_configured():
            return []

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = (
                client.table("farms")
                .select("*")
                .eq("municipality_id", municipality_id)
                .execute()
            )

            return response.data

        except Exception as e:
            logger.error(f"Failed to get farms: {str(e)}")
            return []

    async def get_by_id(self, farm_id: str) -> Optional[dict]:
        """Get farm by ID."""

        if not supabase_service.is_configured():
            return None

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = client.table("farms").select("*").eq("id", farm_id).single().execute()
            return response.data

        except Exception:
            logger.debug(f"Farm not found: {farm_id}")
            return None

    async def count_by_municipality(self, municipality_id: str) -> int:
        """Count farms by municipality."""

        if not supabase_service.is_configured():
            return 0

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = (
                client.table("farms")
                .select("id", count="exact")
                .eq("municipality_id", municipality_id)
                .execute()
            )

            return response.count or 0

        except Exception as e:
            logger.error(f"Failed to count farms: {str(e)}")
            return 0
