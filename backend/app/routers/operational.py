"""Operational data API routes (producers, farms, crops, offers).

Public reads (map, marketplace, AI agent) need no authentication.
Every mutation requires an authenticated user with the producer role, and
ownership is checked against the producer linked to that user.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import ROLE_PRODUCER, AuthUser, require_role, require_user
from app.schemas.operational import (
    CurrentOfferListResponse,
    FarmCreate,
    FarmCropCreate,
    FarmCropResponse,
    FarmCropUpdate,
    FarmResponse,
    FarmUpdate,
    ProducerResponse,
    ProducerUpdate,
    ProductionOfferCreate,
    ProductionOfferResponse,
    ProductionOfferUpdate,
)
from app.services.operational_service import (
    create_farm,
    create_farm_crop,
    create_production_offer,
    get_current_offers,
    get_farm,
    get_farm_crop,
    get_linked_producer,
    get_producer,
    get_production_offer,
    list_farm_crops,
    list_producer_farms,
    list_producers,
    list_production_offers,
    update_farm,
    update_farm_crop,
    update_producer,
    update_production_offer,
)

router = APIRouter(prefix="/operational", tags=["operational"])

ProducerUser = Depends(require_role(ROLE_PRODUCER))


# ========== PRODUCERS ==========


@router.post("/producers", response_model=ProducerResponse)
async def link_my_producer(user: AuthUser = Depends(require_user)):
    """Crea o reactiva el registro productor de la cuenta (sin body: la identidad sale del token)."""
    return await get_linked_producer(user)


@router.get("/producers", response_model=list[ProducerResponse])
async def list_all_producers():
    """List all active producers (public read)."""
    return await list_producers()


@router.get("/producers/{producer_id}", response_model=ProducerResponse)
async def get_producer_details(producer_id: UUID):
    """Get producer details (public read)."""
    result = await get_producer(producer_id)
    if not result:
        raise HTTPException(status_code=404, detail="Producer not found")
    return result


@router.patch("/producers/{producer_id}", response_model=ProducerResponse)
async def update_producer_details(
    producer_id: UUID,
    update: ProducerUpdate,
    user: AuthUser = ProducerUser,
):
    """Update a producer owned by the authenticated user."""
    return await update_producer(producer_id, update, user)


# ========== FARMS ==========


@router.post("/farms", response_model=FarmResponse, status_code=201)
async def create_new_farm(farm: FarmCreate, user: AuthUser = ProducerUser):
    """Create a farm under the authenticated producer."""
    try:
        return await create_farm(farm, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/farms/{farm_id}", response_model=FarmResponse)
async def get_farm_details(farm_id: UUID):
    """Get farm details (public read)."""
    result = await get_farm(farm_id)
    if not result:
        raise HTTPException(status_code=404, detail="Farm not found")
    return result


@router.patch("/farms/{farm_id}", response_model=FarmResponse)
async def update_farm_details(
    farm_id: UUID,
    update: FarmUpdate,
    user: AuthUser = ProducerUser,
):
    """Update a farm owned by the authenticated producer."""
    return await update_farm(farm_id, update.model_dump(exclude_unset=True), user)


@router.get("/producers/{producer_id}/farms", response_model=list[FarmResponse])
async def list_producer_farms_endpoint(producer_id: UUID):
    """List farms for a producer (public read)."""
    return await list_producer_farms(producer_id)


# ========== FARM CROPS ==========


@router.post("/farms/{farm_id}/crops", response_model=FarmCropResponse, status_code=201)
async def create_new_farm_crop(
    farm_id: UUID,
    crop: FarmCropCreate,
    user: AuthUser = ProducerUser,
):
    """Create a crop for a farm owned by the authenticated producer."""
    try:
        return await create_farm_crop(farm_id, crop, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/farms/{farm_id}/crops", response_model=list[FarmCropResponse])
async def list_farm_crops_endpoint(farm_id: UUID):
    """List crops for a farm (public read)."""
    return await list_farm_crops(farm_id)


@router.get("/farm-crops/{farm_crop_id}", response_model=FarmCropResponse)
async def get_farm_crop_details(farm_crop_id: UUID):
    """Get farm crop details (public read)."""
    result = await get_farm_crop(farm_crop_id)
    if not result:
        raise HTTPException(status_code=404, detail="Farm crop not found")
    return result


@router.patch("/farm-crops/{farm_crop_id}", response_model=FarmCropResponse)
async def update_farm_crop_details(
    farm_crop_id: UUID,
    update: FarmCropUpdate,
    user: AuthUser = ProducerUser,
):
    """Update a crop whose farm belongs to the authenticated producer."""
    return await update_farm_crop(farm_crop_id, update.model_dump(exclude_unset=True), user)


# ========== PRODUCTION OFFERS ==========


@router.post(
    "/farm-crops/{farm_crop_id}/offers",
    response_model=ProductionOfferResponse,
    status_code=201,
)
async def create_new_offer(
    farm_crop_id: UUID,
    offer: ProductionOfferCreate,
    user: AuthUser = ProducerUser,
):
    """Create a production offer for a crop owned by the authenticated producer."""
    try:
        return await create_production_offer(farm_crop_id, offer, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/farm-crops/{farm_crop_id}/offers", response_model=list[ProductionOfferResponse])
async def list_farm_crop_offers(farm_crop_id: UUID):
    """List offers for a farm crop (public read)."""
    return await list_production_offers(farm_crop_id)


@router.get("/offers/{offer_id}", response_model=ProductionOfferResponse)
async def get_offer_details(offer_id: UUID):
    """Get offer details (public read)."""
    result = await get_production_offer(offer_id)
    if not result:
        raise HTTPException(status_code=404, detail="Offer not found")
    return result


@router.patch("/offers/{offer_id}", response_model=ProductionOfferResponse)
async def update_offer_details(
    offer_id: UUID,
    update: ProductionOfferUpdate,
    user: AuthUser = ProducerUser,
):
    """Update an offer whose farm belongs to the authenticated producer."""
    return await update_production_offer(offer_id, update, user)


# ========== CURRENT OFFERS (public) ==========


@router.get("/current-offer", response_model=CurrentOfferListResponse)
async def get_current_offers_endpoint(
    municipality_code: Optional[str] = Query(None, description="Filter by municipality DANE code"),
    department_code: Optional[str] = Query(None, description="Filter by department DANE code"),
    crop: Optional[str] = Query(None, description="Filter by crop name"),
    farm_id: Optional[UUID] = Query(None, description="Filter by farm ID"),
):
    """Get current available operational offers (public read)."""
    try:
        return await get_current_offers(
            municipality_code=municipality_code,
            department_code=department_code,
            crop_name=crop,
            farm_id=farm_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
