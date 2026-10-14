"""Ownership checks for the operational model.

Chain of ownership, always resolved by IDs:

    auth user -> profiles.id -> producers.user_id -> producers.id
              -> farms.producer_id -> farm_crops.farm_id -> production_offers.farm_crop_id

Names, emails and other legacy text fields are never used for authorization.
Missing rows answer 404; rows that exist but belong to another account answer 403.
"""

from typing import Optional
from uuid import UUID

from fastapi import HTTPException

from app.repositories.identity_repository import identity_repository
from app.repositories.operational_repository import OperationalRepository

op_repo = OperationalRepository()


def _is_owned_by(row_user_id: Optional[str], user_id: UUID) -> bool:
    return row_user_id is not None and str(row_user_id) == str(user_id)


async def get_active_producer_for_user(user_id: UUID) -> dict:
    """Registro productor activo de la cuenta. 403 si no tiene el rol o está desactivado."""
    producer = await identity_repository.get_producer_by_user(user_id)
    if not producer or not producer.get("active"):
        raise HTTPException(
            status_code=403,
            detail="Activa el rol productor en tu cuenta para registrar información productiva.",
        )
    return producer


async def require_producer_owner(producer_id: UUID, user_id: UUID) -> dict:
    producer = await op_repo.get_row("producers", producer_id, "id,user_id,active")
    if producer is None:
        raise HTTPException(status_code=404, detail="Productor no encontrado")
    if not _is_owned_by(producer.get("user_id"), user_id):
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar este productor")
    return producer


async def require_farm_owner(farm_id: UUID, user_id: UUID) -> dict:
    farm = await op_repo.get_row("farms", farm_id, "id,producer_id")
    if farm is None:
        raise HTTPException(status_code=404, detail="Finca no encontrada")

    producer_id = farm.get("producer_id")
    producer = await op_repo.get_row("producers", producer_id, "id,user_id") if producer_id else None
    if producer is None or not _is_owned_by(producer.get("user_id"), user_id):
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar esta finca")
    return farm


async def require_farm_crop_owner(farm_crop_id: UUID, user_id: UUID) -> dict:
    farm_crop = await op_repo.get_row("farm_crops", farm_crop_id, "id,farm_id")
    if farm_crop is None:
        raise HTTPException(status_code=404, detail="Cultivo no encontrado")
    await require_farm_owner(UUID(str(farm_crop["farm_id"])), user_id)
    return farm_crop


async def require_offer_owner(offer_id: UUID, user_id: UUID) -> dict:
    offer = await op_repo.get_row("production_offers", offer_id, "id,farm_crop_id")
    if offer is None:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")
    await require_farm_crop_owner(UUID(str(offer["farm_crop_id"])), user_id)
    return offer
