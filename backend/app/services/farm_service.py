"""Farm service for farm operations."""

import logging
from typing import Optional

from app.repositories.farm_repository import FarmRepository
from app.repositories.geo_repository import GeoRepository

logger = logging.getLogger(__name__)

farm_repo = FarmRepository()
geo_repo = GeoRepository()


async def create_farm(
    name: str,
    municipality_code: str,
    latitude: float,
    longitude: float,
    description: Optional[str] = None,
    corregimiento_name: Optional[str] = None,
    vereda_name: Optional[str] = None,
) -> dict:
    """Create a new farm."""

    # Verify municipality exists
    municipality = await geo_repo.get_by_dane_code("municipality", municipality_code)

    if not municipality:
        raise ValueError(f"Municipality {municipality_code} not found")

    municipality_id = municipality["id"]

    return await farm_repo.create_farm(
        name=name,
        municipality_id=municipality_id,
        latitude=latitude,
        longitude=longitude,
        description=description,
        corregimiento_name=corregimiento_name,
        vereda_name=vereda_name,
        source_id="agromapa",
    )


async def get_municipality_farms(municipality_code: str) -> list[dict]:
    """Get farms for a municipality."""

    municipality = await geo_repo.get_by_dane_code("municipality", municipality_code)

    if not municipality:
        return []

    return await farm_repo.get_by_municipality(municipality["id"])
