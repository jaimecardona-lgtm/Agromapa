"""Repository for operational data (producers, farms, crops, offers)."""

import logging
from typing import Optional
from uuid import UUID

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


class OperationalRepository:
    """Repository for operational model: producers, farms, crops, offers."""

    def _get_client(self):
        """Get Supabase client."""
        if not supabase_service.is_configured():
            raise RuntimeError("Supabase not configured")
        from supabase import create_client

        return create_client(supabase_service.url, supabase_service.key)

    # ========== PRODUCERS ==========

    async def create_producer(
        self,
        name: str,
        document_type: Optional[str] = None,
        document_number: Optional[str] = None,
        phone: Optional[str] = None,
        email: Optional[str] = None,
        organization: Optional[str] = None,
    ) -> dict:
        """Create a new producer."""
        client = self._get_client()

        data = {
            "name": name,
            "document_type": document_type,
            "document_number": document_number,
            "phone": phone,
            "email": email,
            "organization": organization,
            "active": True,
        }

        try:
            response = client.table("producers").insert(data).execute()
            logger.info(f"Created producer: {name}")
            return response.data[0] if response.data else {}
        except Exception as e:
            logger.error(f"Failed to create producer: {str(e)}")
            raise

    async def get_producer_by_id(self, producer_id: UUID) -> Optional[dict]:
        """Get producer by ID."""
        client = self._get_client()

        try:
            response = client.table("producers").select("*").eq("id", str(producer_id)).single().execute()
            return response.data
        except Exception:
            logger.debug(f"Producer not found: {producer_id}")
            return None

    async def update_producer(self, producer_id: UUID, update_data: dict) -> dict:
        """Update a producer."""
        client = self._get_client()

        try:
            response = client.table("producers").update(update_data).eq("id", str(producer_id)).execute()
            return response.data[0] if response.data else {}
        except Exception as e:
            logger.error(f"Failed to update producer {producer_id}: {str(e)}")
            raise

    async def list_producers(self) -> list[dict]:
        """List all active producers."""
        client = self._get_client()

        try:
            response = client.table("producers").select("*").eq("active", True).execute()
            return response.data
        except Exception as e:
            logger.error(f"Failed to list producers: {str(e)}")
            return []

    # ========== FARMS ==========

    async def create_farm(
        self,
        producer_id: UUID,
        name: str,
        municipality_code: str,
        latitude: float,
        longitude: float,
        description: Optional[str] = None,
        area_ha: Optional[float] = None,
        corregimiento_name: Optional[str] = None,
        vereda_name: Optional[str] = None,
    ) -> dict:
        """Create a new farm linked to a producer."""
        client = self._get_client()

        # Get municipality_id from geo_units
        try:
            geo_response = (
                client.table("geo_units")
                .select("id,name")
                .eq("dane_code", municipality_code)
                .eq("level", "municipality")
                .single()
                .execute()
            )
            if not geo_response.data:
                raise ValueError(f"Municipality {municipality_code} not found")

            municipality_id = geo_response.data["id"]

        except Exception as e:
            logger.error(f"Failed to resolve municipality {municipality_code}: {str(e)}")
            raise

        # Get department_code from municipality
        try:
            parent_response = (
                client.table("geo_units")
                .select("parent_id")
                .eq("id", municipality_id)
                .single()
                .execute()
            )

            parent_id = parent_response.data.get("parent_id") if parent_response.data else None
            department_code = None

            if parent_id:
                dept_response = client.table("geo_units").select("dane_code").eq("id", parent_id).single().execute()
                department_code = dept_response.data.get("dane_code") if dept_response.data else None

        except Exception as e:
            logger.debug(f"Could not determine department code: {str(e)}")
            department_code = None

        data = {
            "producer_id": str(producer_id),
            "name": name,
            "municipality_id": municipality_id,
            "municipality_code": municipality_code,
            "department_code": department_code,
            "latitude": latitude,
            "longitude": longitude,
            "description": description,
            "area_ha": area_ha,
            "corregimiento_name": corregimiento_name,
            "vereda_name": vereda_name,
            "active": True,
            "source_id": (await self._get_source_id("agromapa")) if supabase_service.is_configured() else None,
        }

        try:
            response = client.table("farms").insert(data).execute()
            logger.info(f"Created farm: {name} for producer {producer_id}")
            return response.data[0] if response.data else {}
        except Exception as e:
            logger.error(f"Failed to create farm: {str(e)}")
            raise

    async def get_farm_by_id(self, farm_id: UUID) -> Optional[dict]:
        """Get farm by ID with producer details."""
        client = self._get_client()

        try:
            response = (
                client.table("farms")
                .select("*,producers(*)")
                .eq("id", str(farm_id))
                .single()
                .execute()
            )
            return response.data
        except Exception:
            logger.debug(f"Farm not found: {farm_id}")
            return None

    async def list_farms_by_producer(self, producer_id: UUID) -> list[dict]:
        """List farms for a producer."""
        client = self._get_client()

        try:
            response = (
                client.table("farms")
                .select("*")
                .eq("producer_id", str(producer_id))
                .eq("active", True)
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error(f"Failed to list farms: {str(e)}")
            return []

    async def update_farm(self, farm_id: UUID, update_data: dict) -> dict:
        """Update a farm."""
        client = self._get_client()

        try:
            response = client.table("farms").update(update_data).eq("id", str(farm_id)).execute()
            return response.data[0] if response.data else {}
        except Exception as e:
            logger.error(f"Failed to update farm {farm_id}: {str(e)}")
            raise

    # ========== FARM CROPS ==========

    async def create_farm_crop(
        self,
        farm_id: UUID,
        crop_name: str,
        area_hectares: Optional[float] = None,
        description: Optional[str] = None,
    ) -> dict:
        """Create a crop for a farm."""
        client = self._get_client()

        data = {
            "farm_id": str(farm_id),
            "crop_name": crop_name,
            "area_hectares": area_hectares,
            "description": description,
        }

        try:
            response = client.table("farm_crops").insert(data).execute()
            logger.info(f"Created farm crop: {crop_name} for farm {farm_id}")
            return response.data[0] if response.data else {}
        except Exception as e:
            logger.error(f"Failed to create farm crop: {str(e)}")
            raise

    async def get_farm_crop_by_id(self, farm_crop_id: UUID) -> Optional[dict]:
        """Get farm crop by ID."""
        client = self._get_client()

        try:
            response = (
                client.table("farm_crops").select("*").eq("id", str(farm_crop_id)).single().execute()
            )
            return response.data
        except Exception:
            logger.debug(f"Farm crop not found: {farm_crop_id}")
            return None

    async def list_farm_crops(self, farm_id: UUID) -> list[dict]:
        """List crops for a farm."""
        client = self._get_client()

        try:
            response = (
                client.table("farm_crops")
                .select("*")
                .eq("farm_id", str(farm_id))
                .eq("active", True)
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error(f"Failed to list farm crops: {str(e)}")
            return []

    async def update_farm_crop(self, farm_crop_id: UUID, update_data: dict) -> dict:
        """Update a farm crop."""
        client = self._get_client()

        try:
            response = (
                client.table("farm_crops").update(update_data).eq("id", str(farm_crop_id)).execute()
            )
            return response.data[0] if response.data else {}
        except Exception as e:
            logger.error(f"Failed to update farm crop {farm_crop_id}: {str(e)}")
            raise

    # ========== PRODUCTION OFFERS ==========

    async def create_production_offer(
        self,
        farm_crop_id: UUID,
        available_quantity: float,
        unit: str,
        availability_start: Optional[str] = None,
        availability_end: Optional[str] = None,
        price_per_unit: Optional[float] = None,
        description: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> dict:
        """Create a production offer."""
        client = self._get_client()

        data = {
            "farm_crop_id": str(farm_crop_id),
            "available_quantity": available_quantity,
            "unit": unit,
            "availability_start": availability_start,
            "availability_end": availability_end,
            "price_per_unit": price_per_unit,
            "description": description,
            "notes": notes,
            "status": "available",
        }

        try:
            response = client.table("production_offers").insert(data).execute()
            logger.info(f"Created production offer for farm crop {farm_crop_id}")
            return response.data[0] if response.data else {}
        except Exception as e:
            logger.error(f"Failed to create production offer: {str(e)}")
            raise

    async def get_production_offer_by_id(self, offer_id: UUID) -> Optional[dict]:
        """Get production offer by ID."""
        client = self._get_client()

        try:
            response = (
                client.table("production_offers").select("*").eq("id", str(offer_id)).single().execute()
            )
            return response.data
        except Exception:
            logger.debug(f"Production offer not found: {offer_id}")
            return None

    async def list_production_offers_by_farm_crop(self, farm_crop_id: UUID) -> list[dict]:
        """List offers for a farm crop."""
        client = self._get_client()

        try:
            response = (
                client.table("production_offers")
                .select("*")
                .eq("farm_crop_id", str(farm_crop_id))
                .execute()
            )
            return response.data
        except Exception as e:
            logger.error(f"Failed to list production offers: {str(e)}")
            return []

    async def update_production_offer(self, offer_id: UUID, update_data: dict) -> dict:
        """Update a production offer."""
        client = self._get_client()

        try:
            response = (
                client.table("production_offers")
                .update(update_data)
                .eq("id", str(offer_id))
                .execute()
            )
            return response.data[0] if response.data else {}
        except Exception as e:
            logger.error(f"Failed to update production offer {offer_id}: {str(e)}")
            raise

    async def get_current_operational_offers(
        self,
        municipality_code: Optional[str] = None,
        department_code: Optional[str] = None,
        crop_name: Optional[str] = None,
        farm_id: Optional[UUID] = None,
    ) -> list[dict]:
        """Get current available operational offers with filters."""
        client = self._get_client()

        try:
            query = client.table("current_operational_offers").select("*")

            if municipality_code:
                query = query.eq("municipality_code", municipality_code)

            if crop_name:
                query = query.ilike("crop_name", f"%{crop_name}%")

            if farm_id:
                query = query.eq("farm_id", str(farm_id))

            response = query.order("updated_at", desc=True).execute()
            return response.data
        except Exception as e:
            logger.error(f"Failed to get current offers: {str(e)}")
            return []

    # ========== HELPERS ==========

    async def _get_source_id(self, source_key: str) -> Optional[str]:
        """Get source ID by source key."""
        client = self._get_client()

        try:
            response = (
                client.table("data_sources")
                .select("id")
                .eq("source_key", source_key)
                .single()
                .execute()
            )
            return response.data.get("id") if response.data else None
        except Exception:
            logger.debug(f"Source not found: {source_key}")
            return None
