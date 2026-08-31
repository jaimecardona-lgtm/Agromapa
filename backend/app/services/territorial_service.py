"""Territorial service for geographic operations."""

import logging

from app.repositories.geo_repository import GeoRepository

logger = logging.getLogger(__name__)

geo_repo = GeoRepository()


async def get_departments():
    """Get all departments with real data."""
    return await geo_repo.get_departments()


async def get_municipalities_by_department(department_code: str):
    """Get municipalities for a department."""
    return await geo_repo.get_municipalities_by_department(department_code)


async def get_municipality_detail(department_code: str, municipality_code: str):
    """Get detailed information about a municipality."""
    municipality = await geo_repo.get_by_dane_code("municipality", municipality_code)

    if not municipality:
        return None

    # Verify it belongs to the department
    parent = await geo_repo.get_by_dane_code("department", department_code)

    if not parent or municipality.get("parent_id") != parent.get("id"):
        return None

    return municipality
