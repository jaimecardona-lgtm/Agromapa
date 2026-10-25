"""Marketplace público: perfil de productor. Sin sesión; solo datos autorizados para publicación."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.marketplace import PublicProducerProfile
from app.services.marketplace_service import get_public_producer_profile

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


@router.get("/producers/{producer_id}", response_model=PublicProducerProfile)
async def read_public_producer(producer_id: UUID):
    """Perfil público del productor (id de negocio). 404 si no existe o está inactivo."""
    profile = await get_public_producer_profile(producer_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Productor no encontrado")
    return profile
