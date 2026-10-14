"""Farms API routes (public read; creation moved to the authenticated operational API)."""

from fastapi import APIRouter, HTTPException

from app.services.farm_service import get_municipality_farms

router = APIRouter(prefix="/farms", tags=["farms"])


@router.get("/municipalities/{municipality_code}")
async def list_municipality_farms(municipality_code: str):
    """Get farms for a municipality."""

    farms = await get_municipality_farms(municipality_code)

    return {
        "count": len(farms),
        "data": farms,
    }


@router.post("/", status_code=410)
async def create_new_farm_retired():
    """Retirado: creaba fincas sin autenticación ni productor.

    Usa POST /api/operational/farms con sesión de productor.
    """
    raise HTTPException(
        status_code=410,
        detail="Endpoint retirado. Usa POST /api/operational/farms con una cuenta de productor.",
    )
