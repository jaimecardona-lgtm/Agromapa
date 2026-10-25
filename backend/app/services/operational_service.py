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
    MyProductionOfferResponse,
    ProducerResponse,
    ProducerUpdate,
    ProductionOfferCreate,
    ProductionOfferResponse,
    ProductionOfferUpdate,
    PublicContact,
    PublicProducerResponse,
)
from app.services import identity_service
from app.services.crop_image_service import crop_image_urls

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


PUBLIC_PRODUCER_COLUMNS = "id,name,user_id,active"


def _public_contact(profile: Optional[dict]) -> Optional[PublicContact]:
    """Contacto público: solo con contact_visible. Nunca teléfono/email legacy ni de auth."""
    if not profile or not profile.get("contact_visible"):
        return None
    contact = PublicContact(
        public_phone=profile.get("public_phone"),
        public_email=profile.get("public_email"),
        whatsapp=profile.get("whatsapp"),
    )
    if contact.public_phone is None and contact.public_email is None and contact.whatsapp is None:
        return None
    return contact


def _build_public_producer(producer: dict, profile: Optional[dict]) -> PublicProducerResponse:
    business_name = profile.get("business_name") if profile else None
    return PublicProducerResponse(
        id=UUID(str(producer["id"])),
        display_name=business_name or producer["name"],
        verified=bool(profile.get("verified")) if profile else False,
        description=profile.get("description") if profile else None,
        contact=_public_contact(profile),
        messaging_available=producer.get("user_id") is not None,
    )


async def _build_public_producers(rows: list[dict]) -> list[PublicProducerResponse]:
    user_ids = [str(row["user_id"]) for row in rows if row.get("user_id")]
    profiles = await identity_repository.get_producer_profiles_by_users(user_ids)
    return [
        _build_public_producer(row, profiles.get(str(row["user_id"])) if row.get("user_id") else None)
        for row in rows
    ]


async def get_producer(producer_id: UUID) -> Optional[PublicProducerResponse]:
    """Productor público por ID. Inactivo o inexistente -> None."""
    row = await op_repo.get_producer_by_id(producer_id, PUBLIC_PRODUCER_COLUMNS)
    if not row or not row.get("active"):
        return None
    return (await _build_public_producers([row]))[0]


async def update_producer(producer_id: UUID, update: ProducerUpdate, user: AuthUser) -> ProducerResponse:
    """Update a producer owned by the authenticated user."""
    await require_producer_owner(producer_id, user.id)
    update_data = update.model_dump(exclude_unset=True)
    result = await op_repo.update_producer(producer_id, update_data)
    return ProducerResponse(**result)


async def list_producers() -> List[PublicProducerResponse]:
    """List all active producers, public view only."""
    rows = await op_repo.list_producers(PUBLIC_PRODUCER_COLUMNS)
    return await _build_public_producers(rows)


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


async def list_farm_crops(farm_id: UUID, user: AuthUser) -> List[FarmCropResponse]:
    """List crops for a farm owned by the authenticated user (403 for another producer's farm)."""
    await require_farm_owner(farm_id, user.id)
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


async def list_my_offers(user: AuthUser) -> List[MyProductionOfferResponse]:
    """Offers across all farms of the authenticated producer (includes non-available status)."""
    farms = await list_my_farms(user)
    farm_names = {str(farm.id): farm.name for farm in farms}
    crops = await op_repo.select_in("farm_crops", "farm_id", list(farm_names), "id,farm_id,crop_name")
    crops_by_id = {str(crop["id"]): crop for crop in crops}
    offers = await op_repo.select_in("production_offers", "farm_crop_id", list(crops_by_id))
    images = await crop_image_urls(list(crops_by_id), repo=op_repo)
    result = []
    for row in offers:
        crop = crops_by_id.get(str(row["farm_crop_id"]), {})
        farm_id = str(crop.get("farm_id")) if crop.get("farm_id") else None
        result.append(
            MyProductionOfferResponse(
                **row,
                farm_id=UUID(farm_id) if farm_id else None,
                farm_name=farm_names.get(farm_id) if farm_id else None,
                crop_name=crop.get("crop_name"),
                crop_image_url=images.get(str(row["farm_crop_id"])),
            )
        )
    return result


# ========== CURRENT OPERATIONAL OFFERS ==========


def _to_current_offer(row: dict) -> CurrentOfferResponse:
    """Oferta pública. La vista ya calcula el contacto; aquí solo se elige qué sale al público."""
    return CurrentOfferResponse(
        id=row["id"],
        farm_crop_id=row["farm_crop_id"],
        farm_id=row["farm_id"],
        farm_name=row["farm_name"],
        producer_id=row.get("producer_id"),
        producer_name=row["producer_name"],
        producer_verified=bool(row.get("producer_verified")),
        producer_contact=_public_contact(
            {
                "contact_visible": row.get("producer_contact_visible"),
                "public_phone": row.get("public_phone"),
                "public_email": row.get("public_email"),
                "whatsapp": row.get("whatsapp"),
            }
        ),
        crop_image_url=row.get("crop_image_url"),
        messaging_available=row.get("producer_user_id") is not None,
        municipality_name=row["municipality_name"],
        municipality_code=row.get("municipality_code"),
        crop_name=row["crop_name"],
        quantity=row["quantity"],
        unit=row["unit"],
        available_from=row.get("available_from"),
        available_until=row.get("available_until"),
        price_per_unit=row.get("price_per_unit"),
        expected_harvest_at=row.get("expected_harvest_at"),
        harvested_at=row.get("harvested_at"),
        description=row.get("description"),
        notes=row.get("notes"),
        status=row["status"],
        source=row.get("source", "Raíces Conectadas"),
        data_type=row.get("data_type", "operational"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def get_current_offer(offer_id: UUID) -> Optional[CurrentOfferResponse]:
    """Oferta vigente por ID (misma vista que el listado). None si no está vigente."""
    row = await op_repo.get_row("current_operational_offers", offer_id, "*")
    if row is None:
        return None
    images = await crop_image_urls([str(row["farm_crop_id"])], repo=op_repo)
    row["crop_image_url"] = images.get(str(row["farm_crop_id"]))
    return _to_current_offer(row)


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

        images = await crop_image_urls([str(r["farm_crop_id"]) for r in results if r.get("farm_crop_id")], repo=op_repo)
        for r in results:
            r["crop_image_url"] = images.get(str(r.get("farm_crop_id")))
        offers = [_to_current_offer(r) for r in results]
        return CurrentOfferListResponse(count=len(offers), data=offers)
    except Exception as e:
        logger.error(f"Failed to get current offers: {str(e)}")
        raise
