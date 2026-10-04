"""Pydantic schemas for operational data (producers, farms, offers)."""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProducerCreate(BaseModel):
    """Create a producer."""

    name: str
    document_type: Optional[str] = None
    document_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    organization: Optional[str] = None


class ProducerUpdate(BaseModel):
    """Update a producer."""

    name: Optional[str] = None
    document_type: Optional[str] = None
    document_number: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    organization: Optional[str] = None
    active: Optional[bool] = None


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
    """Create a farm."""

    producer_id: UUID
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


class FarmCropCreate(BaseModel):
    """Create a farm crop."""

    farm_id: UUID
    crop_name: str
    area_hectares: Optional[float] = Field(default=None, ge=0)
    description: Optional[str] = None


class FarmCropUpdate(BaseModel):
    """Update a farm crop."""

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
    """Create a production offer."""

    farm_crop_id: UUID
    available_quantity: float = Field(gt=0)
    unit: str
    availability_start: Optional[date] = None
    availability_end: Optional[date] = None
    price_per_unit: Optional[float] = Field(default=None, ge=0)
    description: Optional[str] = None
    notes: Optional[str] = None


class ProductionOfferUpdate(BaseModel):
    """Update a production offer."""

    available_quantity: Optional[float] = Field(default=None, gt=0)
    unit: Optional[str] = None
    availability_start: Optional[date] = None
    availability_end: Optional[date] = None
    price_per_unit: Optional[float] = Field(default=None, ge=0)
    status: Optional[str] = None
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


class CurrentOfferResponse(BaseModel):
    """Current available offer (detailed with producer/farm info)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    farm_crop_id: UUID
    farm_id: UUID
    farm_name: str
    producer_name: str
    producer_phone: Optional[str] = None
    producer_email: Optional[str] = None
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
