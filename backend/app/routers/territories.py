"""Territories API routes."""

from fastapi import APIRouter, HTTPException

from app.services.territorial_service import (
    get_departments,
    get_municipalities_by_department,
    get_municipality_detail,
)

router = APIRouter(prefix="/territories", tags=["territories"])


@router.get("/departments")
async def list_departments():
    """Get all departments with real geographic data."""

    departments = await get_departments()

    if not departments:
        return {
            "message": "No departments found. Run: python -m app.jobs.sync_upra_geo",
            "data": [],
        }

    return {
        "count": len(departments),
        "data": departments,
    }


@router.get("/departments/{department_code}/municipalities")
async def list_municipalities(department_code: str):
    """Get municipalities for a department."""

    municipalities = await get_municipalities_by_department(department_code)

    if not municipalities:
        return {
            "message": f"No municipalities found for department {department_code}",
            "data": [],
        }

    return {
        "count": len(municipalities),
        "data": municipalities,
    }


@router.get("/departments/{department_code}/municipalities/{municipality_code}")
async def get_municipality(department_code: str, municipality_code: str):
    """Get detailed information about a municipality."""

    municipality = await get_municipality_detail(department_code, municipality_code)

    if not municipality:
        raise HTTPException(status_code=404, detail="Municipality not found")

    return {
        "data": municipality,
    }
