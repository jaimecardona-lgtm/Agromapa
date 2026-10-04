"""Service for operational model (producers, farms, crops, offers)."""

import logging
from typing import List, Optional
from uuid import UUID

from app.repositories.operational_repository import OperationalRepository
from app.schemas.operational import (
    CurrentOfferListResponse,
    CurrentOfferResponse,
    FarmCreate,
    FarmCropCreate,
    FarmCropResponse,
    FarmResponse,
    ProducerCreate,
    ProducerResponse,
    ProducerUpdate,
    ProductionOfferCreate,
    ProductionOfferResponse,
    ProductionOfferUpdate,
)

logger = logging.getLogger(__name__)

op_repo = OperationalRepository()


# ========== PRODUCERS ==========


async def create_producer(producer_create: ProducerCreate) -> ProducerResponse:
    """Create a new producer."""
    try:
        result = await op_repo.create_producer(
            name=producer_create.name,
            document_type=producer_create.document_type,
            document_number=producer_create.document_number,
            phone=producer_create.phone,
            email=producer_create.email,
            organization=producer_create.organization,
        )
        return ProducerResponse(**result)
    except Exception as e:
        logger.error(f"Failed to create producer: {str(e)}")
        raise


async def get_producer(producer_id: UUID) -> Optional[ProducerResponse]:
    """Get a producer by ID."""
    result = await op_repo.get_producer_by_id(producer_id)
    if result:
        return ProducerResponse(**result)
    return None


async def update_producer(producer_id: UUID, update: ProducerUpdate) -> ProducerResponse:
    """Update a producer."""
    update_data = update.model_dump(exclude_unset=True)
    try:
        result = await op_repo.update_producer(producer_id, update_data)
        return ProducerResponse(**result)
    except Exception as e:
        logger.error(f"Failed to update producer: {str(e)}")
        raise


async def list_producers() -> List[ProducerResponse]:
    """List all active producers."""
    results = await op_repo.list_producers()
    return [ProducerResponse(**r) for r in results]


# ========== FARMS ==========


async def create_farm(farm_create: FarmCreate) -> FarmResponse:
    """Create a new farm."""
    try:
        # Verify producer exists
        producer = await get_producer(farm_create.producer_id)
        if not producer:
            raise ValueError(f"Producer {farm_create.producer_id} not found")

        result = await op_repo.create_farm(
            producer_id=farm_create.producer_id,
            name=farm_create.name,
            municipality_code=farm_create.municipality_code,
            latitude=farm_create.latitude,
            longitude=farm_create.longitude,
            description=farm_create.description,
            area_ha=farm_create.area_ha,
            corregimiento_name=farm_create.corregimiento_name,
            vereda_name=farm_create.vereda_name,
        )
        return FarmResponse(**result)
    except Exception as e:
        logger.error(f"Failed to create farm: {str(e)}")
        raise


async def get_farm(farm_id: UUID) -> Optional[FarmResponse]:
    """Get a farm by ID."""
    result = await op_repo.get_farm_by_id(farm_id)
    if result:
        return FarmResponse(**result)
    return None


async def update_farm(farm_id: UUID, update_data: dict) -> FarmResponse:
    """Update a farm."""
    try:
        result = await op_repo.update_farm(farm_id, update_data)
        return FarmResponse(**result)
    except Exception as e:
        logger.error(f"Failed to update farm: {str(e)}")
        raise


async def list_producer_farms(producer_id: UUID) -> List[FarmResponse]:
    """List farms for a producer."""
    results = await op_repo.list_farms_by_producer(producer_id)
    return [FarmResponse(**r) for r in results]


# ========== FARM CROPS ==========


async def create_farm_crop(farm_id: UUID, crop_create: FarmCropCreate) -> FarmCropResponse:
    """Create a crop for a farm."""
    try:
        # Verify farm exists
        farm = await get_farm(farm_id)
        if not farm:
            raise ValueError(f"Farm {farm_id} not found")

        result = await op_repo.create_farm_crop(
            farm_id=farm_id,
            crop_name=crop_create.crop_name,
            area_hectares=crop_create.area_hectares,
            description=crop_create.description,
        )
        return FarmCropResponse(**result)
    except Exception as e:
        logger.error(f"Failed to create farm crop: {str(e)}")
        raise


async def get_farm_crop(farm_crop_id: UUID) -> Optional[FarmCropResponse]:
    """Get a farm crop by ID."""
    result = await op_repo.get_farm_crop_by_id(farm_crop_id)
    if result:
        return FarmCropResponse(**result)
    return None


async def update_farm_crop(farm_crop_id: UUID, update_data: dict) -> FarmCropResponse:
    """Update a farm crop."""
    try:
        result = await op_repo.update_farm_crop(farm_crop_id, update_data)
        return FarmCropResponse(**result)
    except Exception as e:
        logger.error(f"Failed to update farm crop: {str(e)}")
        raise


async def list_farm_crops(farm_id: UUID) -> List[FarmCropResponse]:
    """List crops for a farm."""
    results = await op_repo.list_farm_crops(farm_id)
    return [FarmCropResponse(**r) for r in results]


# ========== PRODUCTION OFFERS ==========


async def create_production_offer(offer_create: ProductionOfferCreate) -> ProductionOfferResponse:
    """Create a production offer."""
    try:
        # Verify farm crop exists
        farm_crop = await get_farm_crop(offer_create.farm_crop_id)
        if not farm_crop:
            raise ValueError(f"Farm crop {offer_create.farm_crop_id} not found")

        result = await op_repo.create_production_offer(
            farm_crop_id=offer_create.farm_crop_id,
            available_quantity=offer_create.available_quantity,
            unit=offer_create.unit,
            availability_start=offer_create.availability_start.isoformat() if offer_create.availability_start else None,
            availability_end=offer_create.availability_end.isoformat() if offer_create.availability_end else None,
            price_per_unit=offer_create.price_per_unit,
            description=offer_create.description,
            notes=offer_create.notes,
        )
        return ProductionOfferResponse(**result)
    except Exception as e:
        logger.error(f"Failed to create production offer: {str(e)}")
        raise


async def get_production_offer(offer_id: UUID) -> Optional[ProductionOfferResponse]:
    """Get a production offer by ID."""
    result = await op_repo.get_production_offer_by_id(offer_id)
    if result:
        return ProductionOfferResponse(**result)
    return None


async def update_production_offer(
    offer_id: UUID, update: ProductionOfferUpdate
) -> ProductionOfferResponse:
    """Update a production offer."""
    update_data = update.model_dump(exclude_unset=True)
    # Convert dates to ISO format
    if "availability_start" in update_data and update_data["availability_start"]:
        update_data["availability_start"] = update_data["availability_start"].isoformat()
    if "availability_end" in update_data and update_data["availability_end"]:
        update_data["availability_end"] = update_data["availability_end"].isoformat()

    try:
        result = await op_repo.update_production_offer(offer_id, update_data)
        return ProductionOfferResponse(**result)
    except Exception as e:
        logger.error(f"Failed to update production offer: {str(e)}")
        raise


async def list_production_offers(farm_crop_id: UUID) -> List[ProductionOfferResponse]:
    """List offers for a farm crop."""
    results = await op_repo.list_production_offers_by_farm_crop(farm_crop_id)
    return [ProductionOfferResponse(**r) for r in results]


# ========== CURRENT OPERATIONAL OFFERS ==========


async def get_current_offers(
    municipality_code: Optional[str] = None,
    department_code: Optional[str] = None,
    crop_name: Optional[str] = None,
    farm_id: Optional[UUID] = None,
) -> CurrentOfferListResponse:
    """Get current available operational offers."""
    try:
        results = await op_repo.get_current_operational_offers(
            municipality_code=municipality_code,
            department_code=department_code,
            crop_name=crop_name,
            farm_id=farm_id,
        )

        offers = [CurrentOfferResponse(**r) for r in results]
        return CurrentOfferListResponse(count=len(offers), data=offers)
    except Exception as e:
        logger.error(f"Failed to get current offers: {str(e)}")
        raise
