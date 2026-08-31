"""Farms API routes (development only)."""

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.services.farm_service import create_farm, get_municipality_farms

router = APIRouter(prefix="/farms", tags=["farms"])


@router.get("/municipalities/{municipality_code}")
async def list_municipality_farms(municipality_code: str):
    """Get farms for a municipality."""

    farms = await get_municipality_farms(municipality_code)

    return {
        "count": len(farms),
        "data": farms,
    }


@router.post("/")
async def create_new_farm(
    name: str,
    municipality_code: str,
    latitude: float,
    longitude: float,
    description: str = None,
    corregimiento_name: str = None,
    vereda_name: str = None,
):
    """Create a new farm (development only)."""

    if settings.APP_ENV != "development":
        raise HTTPException(status_code=403, detail="Farm creation only available in development")

    try:
        farm = await create_farm(
            name=name,
            municipality_code=municipality_code,
            latitude=latitude,
            longitude=longitude,
            description=description,
            corregimiento_name=corregimiento_name,
            vereda_name=vereda_name,
        )

        return {
            "data": farm,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
