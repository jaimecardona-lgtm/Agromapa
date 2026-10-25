"""Repository for operational data (producers, farms, crops, offers)."""

import logging
from typing import Optional
from uuid import UUID

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


# Columnas públicas explícitas: el marketplace nunca recibe filas completas.
PUBLIC_FARM_COLUMNS = "id,name,description,area_ha,latitude,longitude,municipality_id,producer_id,active"
PUBLIC_OFFER_COLUMNS = (
    "id,farm_id,farm_name,municipality_name,municipality_code,crop_name,quantity,unit,"
    "price_per_unit,available_from,available_until,status,description,producer_id,farm_crop_id,updated_at"
)


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

    async def get_producer_by_id(self, producer_id: UUID, columns: str = "*") -> Optional[dict]:
        """Get producer by ID. Public callers pass explicit columns (never phone/email)."""
        client = self._get_client()

        try:
            response = client.table("producers").select(columns).eq("id", str(producer_id)).single().execute()
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

    async def list_producers(self, columns: str = "*") -> list[dict]:
        """List all active producers. Public callers pass explicit columns (never phone/email)."""
        client = self._get_client()

        try:
            response = client.table("producers").select(columns).eq("active", True).execute()
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

    async def list_all_farms_by_producer(self, producer_id: UUID) -> list[dict]:
        """Todas las fincas del productor, activas o no (uso del propio productor)."""
        client = self._get_client()
        response = (
            client.table("farms").select("*").eq("producer_id", str(producer_id)).execute()
        )
        return response.data or []

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
        """List crops for a farm, oldest first. Errors propagate: never an empty list by accident."""
        client = self._get_client()

        try:
            response = (
                client.table("farm_crops")
                .select("*")
                .eq("farm_id", str(farm_id))
                .order("created_at")
                .execute()
            )
            return response.data or []
        except Exception as e:
            logger.error("Failed to list farm crops for farm %s: %s", farm_id, e)
            raise

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

            if department_code:
                query = query.eq("department_code", department_code)

            if farm_id:
                query = query.eq("farm_id", str(farm_id))

            response = query.order("updated_at", desc=True).execute()
            return response.data
        except Exception as e:
            logger.error(f"Failed to get current offers: {str(e)}")
            return []

    async def list_public_farms(
        self, municipality_id: Optional[str] = None, producer_id: Optional[UUID] = None
    ) -> list[dict]:
        """Fincas activas con columnas públicas explícitas. Nunca select(*): la tabla tiene columnas legacy de contacto.

        Los errores se propagan: un fallo no se confunde con "no hay fincas".
        """
        query = self._get_client().table("farms").select(PUBLIC_FARM_COLUMNS).eq("active", True)
        if municipality_id:
            query = query.eq("municipality_id", str(municipality_id))
        if producer_id:
            query = query.eq("producer_id", str(producer_id))
        response = query.order("name").execute()
        return response.data or []

    async def list_active_offers_by_producer(self, producer_id: UUID) -> list[dict]:
        """Ofertas vigentes de un productor desde la vista pública, con columnas explícitas. Errores propagados."""
        response = (
            self._get_client()
            .table("current_operational_offers")
            .select(PUBLIC_OFFER_COLUMNS)
            .eq("producer_id", str(producer_id))
            .order("updated_at", desc=True)
            .execute()
        )
        return response.data or []

    # ========== GENERIC (ownership and listings) ==========

    async def claim_crop_illustration(self, farm_crop_id: UUID) -> Optional[dict]:
        """Marca 'pending' solo si el cultivo está en none o failed. Devuelve la fila o None si ya estaba en curso."""
        response = (
            self._get_client()
            .table("farm_crops")
            .update({"illustrative_image_status": "pending"})
            .eq("id", str(farm_crop_id))
            .in_("illustrative_image_status", ["none", "failed"])
            .execute()
        )
        return response.data[0] if response.data else None

    async def set_crop_illustration(self, farm_crop_id: UUID, fields: dict) -> None:
        self._get_client().table("farm_crops").update(fields).eq("id", str(farm_crop_id)).execute()

    async def select_crop_image_rows(self, crop_ids: list[str]) -> list[dict]:
        """Estado e imagen de cultivos por id. Lista vacía -> sin consulta."""
        if not crop_ids:
            return []
        response = (
            self._get_client()
            .table("farm_crops")
            .select("id,illustrative_image_url,illustrative_image_status")
            .in_("id", crop_ids)
            .execute()
        )
        return response.data or []

    async def get_row(self, table: str, row_id: UUID | str, columns: str = "*") -> Optional[dict]:
        """Fila por ID o None. Usa limit(1) para no lanzar excepciones por filas ausentes."""
        response = (
            self._get_client().table(table).select(columns).eq("id", str(row_id)).limit(1).execute()
        )
        return response.data[0] if response.data else None

    async def select_in(self, table: str, column: str, values: list[str], columns: str = "*") -> list[dict]:
        """Filas cuyo `column` está en `values`. Lista vacía -> sin consulta."""
        if not values:
            return []
        response = self._get_client().table(table).select(columns).in_(column, values).execute()
        return response.data or []

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
