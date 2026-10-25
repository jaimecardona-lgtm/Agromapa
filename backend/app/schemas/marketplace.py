"""DTOs públicos del marketplace y del mapa.

Principio: campos explícitos. Nada de filas completas de Supabase. Por diseño NO existen aquí
email, teléfono, WhatsApp, user_id, producer_contact ni datos de autenticación.
"""

from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PublicCrop(BaseModel):
    name: str
    area_hectares: Optional[float] = None
    image_url: Optional[str] = None


class PublicFarm(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    area_ha: Optional[float] = None
    latitude: float
    longitude: float
    municipality_code: Optional[str] = None
    municipality_name: Optional[str] = None
    producer_id: Optional[UUID] = None
    producer_name: Optional[str] = None
    producer_verified: bool = False
    crops: list[PublicCrop] = Field(default_factory=list)


class PublicFarmsResponse(BaseModel):
    count: int
    data: list[PublicFarm]


class PublicTerritory(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None


class PublicOffer(BaseModel):
    id: UUID
    crop_name: str
    farm_id: UUID
    farm_name: str
    municipality_code: Optional[str] = None
    municipality_name: Optional[str] = None
    quantity: float
    unit: str
    price_per_unit: Optional[float] = None
    available_from: Optional[date] = None
    available_until: Optional[date] = None
    status: str
    description: Optional[str] = None
    crop_image_url: Optional[str] = None


class PublicProducerProfile(BaseModel):
    id: UUID
    name: str
    verified: bool = False
    description: Optional[str] = None
    department: PublicTerritory
    municipality: PublicTerritory
    farms: list[PublicFarm]
    active_offers: list[PublicOffer]
