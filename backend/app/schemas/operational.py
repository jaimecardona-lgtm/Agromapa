"""Pydantic schemas for operational data (producers, farms, offers)."""

from datetime import date, datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

OFFER_STATUSES = ("available", "harvested", "sold_out", "inactive", "historical")
OfferStatus = Literal["available", "harvested", "sold_out", "inactive", "historical"]


class ProducerCreate(BaseModel):
    """Create the producer linked to the authenticated account (user_id is never read from the body)."""

    model_config = ConfigDict(extra="forbid")

    name: str
    document_type: Optional[str] = None
    document_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    organization: Optional[str] = None


class ProducerUpdate(BaseModel):
    """Update the producer. `active` is managed by the producer role, not by this payload."""

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    document_type: Optional[str] = None
    document_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    organization: Optional[str] = None


class ProducerResponse(BaseModel):
    """Producer response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    document_type: Optional[str] = None
    document_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    organization: Optional[str] = None
    active: bool
    created_at: datetime
    updated_at: datetime


class FarmCreate(BaseModel):
    """Create a farm for the authenticated producer (producer_id is resolved server-side)."""

    model_config = ConfigDict(extra="forbid")

    name: str
    municipality_code: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    description: Optional[str] = None
    area_ha: Optional[float] = Field(default=None, ge=0)
    corregimiento_name: Optional[str] = None
    vereda_name: Optional[str] = None


class FarmUpdate(BaseModel):
    """Update a farm."""

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    description: Optional[str] = None
    area_ha: Optional[float] = Field(default=None, ge=0)
    corregimiento_name: Optional[str] = None
    vereda_name: Optional[str] = None
    active: Optional[bool] = None


class FarmResponse(BaseModel):
    """Farm response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    producer_id: Optional[UUID] = None
    name: str
    municipality_code: Optional[str] = None
    municipality_name: Optional[str] = None
    latitude: float
    longitude: float
    description: Optional[str] = None
    area_ha: Optional[float] = None
    corregimiento_name: Optional[str] = None
    vereda_name: Optional[str] = None
    active: bool
    created_at: datetime
    updated_at: datetime
    illustrative_image_url: Optional[str] = None
    illustrative_image_status: Optional[str] = None


class FarmCropCreate(BaseModel):
    """Create a crop for the farm in the route (farm_id is not read from the body)."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    crop_name: str = Field(min_length=1, max_length=120)
    area_hectares: Optional[float] = Field(default=None, ge=0)
    description: Optional[str] = None


class FarmCropUpdate(BaseModel):
    """Update a farm crop."""

    model_config = ConfigDict(extra="forbid")

    crop_name: Optional[str] = None
    area_hectares: Optional[float] = Field(default=None, ge=0)
    description: Optional[str] = None


class FarmCropResponse(BaseModel):
    """Farm crop response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    farm_id: UUID
    crop_name: str
    description: Optional[str] = None
    area_hectares: Optional[float] = None
    expected_harvest_at: Optional[date] = None
    created_at: datetime
    updated_at: datetime


class ProductionOfferCreate(BaseModel):
    """Create an offer for the crop in the route (farm_crop_id is not read from the body)."""

    model_config = ConfigDict(extra="forbid")

    available_quantity: float = Field(gt=0)
    unit: str
    availability_start: Optional[date] = None
    availability_end: Optional[date] = None
    price_per_unit: Optional[float] = Field(default=None, ge=0)
    description: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _availability_window_is_ordered(self):
        start, end = self.availability_start, self.availability_end
        if start is not None and end is not None and end < start:
            raise ValueError("availability_end no puede ser anterior a availability_start")
        return self


class ProductionOfferUpdate(BaseModel):
    """Update a production offer."""

    model_config = ConfigDict(extra="forbid")

    available_quantity: Optional[float] = Field(default=None, gt=0)
    unit: Optional[str] = None
    availability_start: Optional[date] = None
    availability_end: Optional[date] = None
    price_per_unit: Optional[float] = Field(default=None, ge=0)
    status: Optional[OfferStatus] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    harvested_at: Optional[datetime] = None


class ProductionOfferResponse(BaseModel):
    """Production offer response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    farm_crop_id: UUID
    available_quantity: float
    unit: str
    availability_start: Optional[date] = None
    availability_end: Optional[date] = None
    price_per_unit: Optional[float] = None
    status: str
    description: Optional[str] = None
    notes: Optional[str] = None
    harvested_at: Optional[datetime] = None
    expected_harvest_at: Optional[date] = None
    created_at: datetime
    updated_at: datetime


class MyProductionOfferResponse(ProductionOfferResponse):
    """Oferta propia con su contexto (cultivo y finca) para el listado del productor."""

    farm_id: Optional[UUID] = None
    farm_name: Optional[str] = None
    crop_name: Optional[str] = None
    crop_image_url: Optional[str] = None


class PublicContact(BaseModel):
    """Contacto comercial público. Existe solo si el productor activó contact_visible."""

    public_phone: Optional[str] = None
    public_email: Optional[str] = None
    whatsapp: Optional[str] = None


class PublicProducerResponse(BaseModel):
    """Productor visible al público: nunca teléfono/email legacy ni datos de cuenta."""

    id: UUID
    display_name: str
    verified: bool = False
    description: Optional[str] = None
    contact: Optional[PublicContact] = None
    messaging_available: bool = False


class CurrentOfferResponse(BaseModel):
    """Current available offer (public: sin datos privados del productor)."""

    id: UUID
    farm_crop_id: UUID
    farm_id: UUID
    farm_name: str
    producer_id: Optional[UUID] = None
    crop_image_url: Optional[str] = None
    producer_name: str
    producer_verified: bool = False
    producer_contact: Optional[PublicContact] = None
    messaging_available: bool = False
    municipality_name: str
    municipality_code: Optional[str] = None
    crop_name: str
    quantity: float
    unit: str
    available_from: Optional[date] = None
    available_until: Optional[date] = None
    price_per_unit: Optional[float] = None
    expected_harvest_at: Optional[date] = None
    harvested_at: Optional[datetime] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    status: str
    source: str = "Raíces Conectadas"
    data_type: str = "operational"
    created_at: datetime
    updated_at: datetime


class CurrentOfferListResponse(BaseModel):
    """List of current operational offers."""

    count: int
    data: List[CurrentOfferResponse]
