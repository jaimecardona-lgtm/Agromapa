"""Service for operational model (producers, farms, crops, offers).

Reads stay public (map, marketplace, AI agent). Writes receive the producer
identity from the validated token and the target row from the route, and
ownership is checked in app.core.ownership before any mutation.
"""

import logging
from typing import List, Optional
from uuid import UUID

from app.core.auth import AuthUser
from app.core.ownership import (
    get_active_producer_for_user,
    require_farm_crop_owner,
    require_farm_owner,
    require_offer_owner,
    require_producer_owner,
)
from app.repositories.identity_repository import identity_repository
from app.repositories.operational_repository import OperationalRepository
from app.schemas.operational import (
    CurrentOfferListResponse,
    CurrentOfferResponse,
    FarmCreate,
    FarmCropCreate,
    FarmCropResponse,
    FarmResponse,
    ProducerResponse,
    ProducerUpdate,
    ProductionOfferCreate,
    ProductionOfferResponse,
    ProductionOfferUpdate,
)
from app.services import identity_service

logger = logging.getLogger(__name__)

op_repo = OperationalRepository()


# ========== PRODUCERS ==========


async def get_linked_producer(user: AuthUser) -> ProducerResponse:
    """Registro productor de la cuenta. Lo crea o reactiva si el rol productor está activo."""
    await identity_service.activate_role(user, "producer")
    producer = await get_active_producer_for_user(user.id)
    row = await op_repo.get_row("producers", UUID(str(producer["id"])), "*")
    if row is None:
        raise RuntimeError("No se encontró el productor vinculado a la cuenta")
    return ProducerResponse(**row)


async def get_producer(producer_id: UUID) -> Optional[ProducerResponse]:
    """Get a producer by ID."""
    result = await op_repo.get_producer_by_id(producer_id)
    if result:
        return ProducerResponse(**result)
    return None


async def update_producer(producer_id: UUID, update: ProducerUpdate, user: AuthUser) -> ProducerResponse:
    """Update a producer owned by the authenticated user."""
    await require_producer_owner(producer_id, user.id)
    update_data = update.model_dump(exclude_unset=True)
    result = await op_repo.update_producer(producer_id, update_data)
    return ProducerResponse(**result)


async def list_producers() -> List[ProducerResponse]:
    """List all active producers."""
    results = await op_repo.list_producers()
    return [ProducerResponse(**r) for r in results]


# ========== FARMS ==========


async def create_farm(farm_create: FarmCreate, user: AuthUser) -> FarmResponse:
    """Create a farm under the producer linked to the authenticated account."""
    producer = await get_active_producer_for_user(user.id)
    producer_id = UUID(str(producer["id"]))

    result = await op_repo.create_farm(
        producer_id=producer_id,
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


async def get_farm(farm_id: UUID) -> Optional[FarmResponse]:
    """Get a farm by ID."""
    result = await op_repo.get_farm_by_id(farm_id)
    if result:
        return FarmResponse(**result)
    return None


async def update_farm(farm_id: UUID, update_data: dict, user: AuthUser) -> FarmResponse:
    """Update a farm owned by the authenticated user."""
    await require_farm_owner(farm_id, user.id)
    result = await op_repo.update_farm(farm_id, update_data)
    return FarmResponse(**result)


async def list_producer_farms(producer_id: UUID) -> List[FarmResponse]:
    """List farms for a producer (public read)."""
    results = await op_repo.list_farms_by_producer(producer_id)
    return [FarmResponse(**r) for r in results]


async def list_my_farms(user: AuthUser) -> List[FarmResponse]:
    """Farms of the producer linked to the authenticated account (includes inactive)."""
    producer = await identity_repository.get_producer_by_user(user.id)
    if not producer:
        return []
    rows = await op_repo.list_all_farms_by_producer(UUID(str(producer["id"])))
    return [FarmResponse(**r) for r in rows]


# ========== FARM CROPS ==========


async def create_farm_crop(farm_id: UUID, crop_create: FarmCropCreate, user: AuthUser) -> FarmCropResponse:
    """Create a crop for a farm owned by the authenticated user."""
    await require_farm_owner(farm_id, user.id)
    result = await op_repo.create_farm_crop(
        farm_id=farm_id,
        crop_name=crop_create.crop_name,
        area_hectares=crop_create.area_hectares,
        description=crop_create.description,
    )
    return FarmCropResponse(**result)


async def get_farm_crop(farm_crop_id: UUID) -> Optional[FarmCropResponse]:
    """Get a farm crop by ID."""
    result = await op_repo.get_farm_crop_by_id(farm_crop_id)
    if result:
        return FarmCropResponse(**result)
    return None


async def update_farm_crop(farm_crop_id: UUID, update_data: dict, user: AuthUser) -> FarmCropResponse:
    """Update a crop whose farm belongs to the authenticated user."""
    await require_farm_crop_owner(farm_crop_id, user.id)
    result = await op_repo.update_farm_crop(farm_crop_id, update_data)
    return FarmCropResponse(**result)


async def list_farm_crops(farm_id: UUID) -> List[FarmCropResponse]:
    """List crops for a farm (public read)."""
    results = await op_repo.list_farm_crops(farm_id)
    return [FarmCropResponse(**r) for r in results]


# ========== PRODUCTION OFFERS ==========


async def create_production_offer(
    farm_crop_id: UUID, offer_create: ProductionOfferCreate, user: AuthUser
) -> ProductionOfferResponse:
    """Create an offer for a crop whose farm belongs to the authenticated user."""
    await require_farm_crop_owner(farm_crop_id, user.id)
    result = await op_repo.create_production_offer(
        farm_crop_id=farm_crop_id,
        available_quantity=offer_create.available_quantity,
        unit=offer_create.unit,
        availability_start=offer_create.availability_start.isoformat() if offer_create.availability_start else None,
        availability_end=offer_create.availability_end.isoformat() if offer_create.availability_end else None,
        price_per_unit=offer_create.price_per_unit,
        description=offer_create.description,
        notes=offer_create.notes,
    )
    return ProductionOfferResponse(**result)


async def get_production_offer(offer_id: UUID) -> Optional[ProductionOfferResponse]:
    """Get a production offer by ID."""
    result = await op_repo.get_production_offer_by_id(offer_id)
    if result:
        return ProductionOfferResponse(**result)
    return None


async def update_production_offer(
    offer_id: UUID, update: ProductionOfferUpdate, user: AuthUser
) -> ProductionOfferResponse:
    """Update an offer whose farm belongs to the authenticated user."""
    await require_offer_owner(offer_id, user.id)
    update_data = update.model_dump(exclude_unset=True)
    # Convert dates to ISO format
    if "availability_start" in update_data and update_data["availability_start"]:
        update_data["availability_start"] = update_data["availability_start"].isoformat()
    if "availability_end" in update_data and update_data["availability_end"]:
        update_data["availability_end"] = update_data["availability_end"].isoformat()

    result = await op_repo.update_production_offer(offer_id, update_data)
    return ProductionOfferResponse(**result)


async def list_production_offers(farm_crop_id: UUID) -> List[ProductionOfferResponse]:
    """List offers for a farm crop (public read)."""
    results = await op_repo.list_production_offers_by_farm_crop(farm_crop_id)
    return [ProductionOfferResponse(**r) for r in results]


async def list_my_offers(user: AuthUser) -> List[ProductionOfferResponse]:
    """Offers across all farms of the authenticated producer (includes non-available status)."""
    farms = await list_my_farms(user)
    farm_ids = [str(farm.id) for farm in farms]
    crops = await op_repo.select_in("farm_crops", "farm_id", farm_ids, "id")
    crop_ids = [str(crop["id"]) for crop in crops]
    offers = await op_repo.select_in("production_offers", "farm_crop_id", crop_ids)
    return [ProductionOfferResponse(**row) for row in offers]


# ========== CURRENT OPERATIONAL OFFERS ==========


async def get_current_offers(
    municipality_code: Optional[str] = None,
    department_code: Optional[str] = None,
    crop_name: Optional[str] = None,
    farm_id: Optional[UUID] = None,
) -> CurrentOfferListResponse:
    """Get current available operational offers (public read)."""
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
