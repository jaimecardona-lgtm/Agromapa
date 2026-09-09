"""Agriculture API routes."""

from fastapi import APIRouter, Query

from app.schemas.agriculture import MunicipalityAgricultureResponse
from app.services.agriculture_service import get_municipality_agriculture

router = APIRouter(prefix="/agriculture", tags=["agriculture"])


@router.get("/municipalities/{municipality_code}", response_model=MunicipalityAgricultureResponse)
async def get_municipality_stats(
    municipality_code: str,
    year: int = Query(2024, description="Year for which to fetch statistics"),
) -> MunicipalityAgricultureResponse:
    """Get agricultural statistics for a municipality."""

    stats = await get_municipality_agriculture(municipality_code, year)

    if not stats:
        return MunicipalityAgricultureResponse(
            message=(
                f"No agricultural data found for municipality {municipality_code} in year {year}. "
                f"Run: python -m app.jobs.sync_eva --year {year}"
            ),
            data=None,
        )

    return MunicipalityAgricultureResponse(
        data=stats,
    )
