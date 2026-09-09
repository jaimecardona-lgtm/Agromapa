"""Agricultural data service."""

import logging
from typing import Optional

from app.repositories.agriculture_repository import AgricultureRepository
from app.repositories.geo_repository import GeoRepository

logger = logging.getLogger(__name__)

ag_repo = AgricultureRepository()
geo_repo = GeoRepository()


async def get_municipality_agriculture(municipality_code: str, year: int) -> Optional[dict]:
    """Get agricultural statistics for a municipality with complete EVA dimensions."""

    municipality = await geo_repo.get_by_dane_code("municipality", municipality_code)

    if not municipality:
        return None

    municipality_id = municipality["id"]
    stats = await ag_repo.get_by_municipality_and_year(municipality_id, year)

    if not stats:
        return None

    # Process all real EVA fields without losing source dimensions
    crops_data = []
    total_planted = 0.0
    total_harvested = 0.0
    total_production = 0.0

    for stat in stats:
        planted = float(stat["area_planted_ha"]) if stat.get("area_planted_ha") is not None else None
        harvested = float(stat["area_harvested_ha"]) if stat.get("area_harvested_ha") is not None else None
        production = float(stat["production_tons"]) if stat.get("production_tons") is not None else None
        yield_val = float(stat["yield_t_ha"]) if stat.get("yield_t_ha") is not None else None

        if planted is not None:
            total_planted += planted
        if harvested is not None:
            total_harvested += harvested
        if production is not None:
            total_production += production

        crops_data.append(
            {
                "crop_code": stat.get("crop_code"),
                "crop_name": stat.get("crop_name"),
                "crop_group": stat.get("crop_group"),
                "crop_subgroup": stat.get("crop_subgroup"),
                "crop_cycle": stat.get("crop_cycle"),
                "crop_disaggregation": stat.get("crop_disaggregation"),
                "period": stat.get("period"),
                "crop_physical_state": stat.get("crop_physical_state"),
                "crop_scientific_name": stat.get("crop_scientific_name"),
                "area_planted_ha": planted,
                "area_harvested_ha": harvested,
                "production_tons": production,
                "yield_t_ha": yield_val,
            }
        )

    # Average yield computed as production / harvested_area; never sum yield_t_ha directly
    avg_yield = (total_production / total_harvested) if total_harvested > 0 else None

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
        "total_area_planted_ha": round(total_planted, 2),
        "total_area_harvested_ha": round(total_harvested, 2),
        "total_production_tons": round(total_production, 2),
        "average_yield_t_ha": round(avg_yield, 2) if avg_yield is not None else None,
    }
