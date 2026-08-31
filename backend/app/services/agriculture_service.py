"""Agricultural data service."""

import logging
from typing import Optional

from app.repositories.agriculture_repository import AgricultureRepository
from app.repositories.geo_repository import GeoRepository

logger = logging.getLogger(__name__)

ag_repo = AgricultureRepository()
geo_repo = GeoRepository()


async def get_municipality_agriculture(municipality_code: str, year: int) -> Optional[dict]:
    """Get agricultural statistics for a municipality."""

    municipality = await geo_repo.get_by_dane_code("municipality", municipality_code)

    if not municipality:
        return None

    municipality_id = municipality["id"]
    stats = await ag_repo.get_by_municipality_and_year(municipality_id, year)

    if not stats:
        return None

    # Aggregate stats
    crops_data = []
    for stat in stats:
        crops_data.append(
            {
                "crop_name": stat["crop_name"],
                "crop_group": stat["crop_group"],
                "area_planted_ha": stat["area_planted_ha"],
                "area_harvested_ha": stat["area_harvested_ha"],
                "production_tons": stat["production_tons"],
                "yield_t_ha": stat["yield_t_ha"],
            }
        )

    return {
        "municipality": {
            "dane_code": municipality_code,
            "name": municipality["name"],
        },
        "year": year,
        "source": {
            "id": "upra_eva",
            "name": "EVA",
        },
        "crops": crops_data,
        "total_area_planted_ha": sum(c.get("area_planted_ha") or 0 for c in crops_data),
        "total_production_tons": sum(c.get("production_tons") or 0 for c in crops_data),
    }
