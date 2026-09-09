"""Tools for the AgroMapa master agent."""

import logging

from app.repositories.agriculture_repository import AgricultureRepository
from app.repositories.farm_repository import FarmRepository
from app.repositories.geo_repository import GeoRepository
from app.services.agriculture_service import get_municipality_agriculture
from app.services.farm_service import get_municipality_farms
from app.services.territorial_service import get_departments, get_municipalities_by_department

logger = logging.getLogger(__name__)

ag_repo = AgricultureRepository()
geo_repo = GeoRepository()
farm_repo = FarmRepository()


AGENT_TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "get_departments",
            "description": "Get list of all departments in Colombia with DANE codes",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_department_municipalities",
            "description": "Get municipalities for a specific department",
            "parameters": {
                "type": "object",
                "properties": {
                    "department_code": {
                        "type": "string",
                        "description": "DANE code of the department (e.g., '76')",
                    },
                },
                "required": ["department_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_municipality",
            "description": "Get detailed information about a municipality",
            "parameters": {
                "type": "object",
                "properties": {
                    "municipality_code": {
                        "type": "string",
                        "description": "DANE code of the municipality (e.g., '76001')",
                    },
                },
                "required": ["municipality_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_municipality_agriculture",
            "description": "Get EVA (official agricultural statistics) for a municipality",
            "parameters": {
                "type": "object",
                "properties": {
                    "municipality_code": {
                        "type": "string",
                        "description": "DANE code of the municipality",
                    },
                    "year": {
                        "type": "integer",
                        "description": "Year for statistics (default 2024)",
                        "default": 2024,
                    },
                },
                "required": ["municipality_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_department_agriculture",
            "description": "Get EVA statistics aggregated for a department",
            "parameters": {
                "type": "object",
                "properties": {
                    "department_code": {
                        "type": "string",
                        "description": "DANE code of the department",
                    },
                    "year": {
                        "type": "integer",
                        "description": "Year for statistics (default 2024)",
                        "default": 2024,
                    },
                },
                "required": ["department_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_crop",
            "description": "Search for crop statistics by name, optionally filtered by department",
            "parameters": {
                "type": "object",
                "properties": {
                    "crop": {
                        "type": "string",
                        "description": "Crop name (e.g., 'coffee', 'rice', 'potato')",
                    },
                    "year": {
                        "type": "integer",
                        "description": "Year for statistics (default 2024)",
                        "default": 2024,
                    },
                    "department_code": {
                        "type": "string",
                        "description": "Optional DANE code to filter by department",
                    },
                },
                "required": ["crop"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_municipality_farms",
            "description": "Get farms currently registered in AgroMapa for a municipality",
            "parameters": {
                "type": "object",
                "properties": {
                    "municipality_code": {
                        "type": "string",
                        "description": "DANE code of the municipality",
                    },
                },
                "required": ["municipality_code"],
            },
        },
    },
]


async def execute_tool(tool_name: str, arguments: dict) -> dict:
    """Execute a tool and return the result."""

    try:
        if tool_name == "get_departments":
            result = await get_departments()
            return {"success": True, "data": result}

        elif tool_name == "get_department_municipalities":
            department_code = arguments.get("department_code")
            result = await get_municipalities_by_department(department_code)
            return {"success": True, "data": result}

        elif tool_name == "get_municipality":
            municipality_code = arguments.get("municipality_code")
            municipality = await geo_repo.get_by_dane_code("municipality", municipality_code)
            if not municipality:
                return {"success": False, "error": f"Municipality {municipality_code} not found"}
            return {"success": True, "data": municipality}

        elif tool_name == "get_municipality_agriculture":
            municipality_code = arguments.get("municipality_code")
            year = arguments.get("year", 2024)
            result = await get_municipality_agriculture(municipality_code, year)
            if not result:
                return {"success": False, "error": f"No agriculture data found for {municipality_code}/{year}"}
            return {"success": True, "data": result}

        elif tool_name == "get_department_agriculture":
            department_code = arguments.get("department_code")
            year = arguments.get("year", 2024)

            department = await geo_repo.get_by_dane_code("department", department_code)
            if not department:
                return {"success": False, "error": f"Department {department_code} not found"}

            municipalities = await get_municipalities_by_department(department_code)
            if not municipalities:
                return {"success": False, "error": f"No municipalities found for department {department_code}"}

            all_crops = []
            total_planted = 0.0
            total_harvested = 0.0
            total_production = 0.0

            for muni in municipalities:
                muni_code = muni.get("dane_code")
                muni_ag = await get_municipality_agriculture(muni_code, year)
                if muni_ag:
                    all_crops.extend(muni_ag.get("crops", []))
                    total_planted += muni_ag.get("total_area_planted_ha", 0)
                    total_harvested += muni_ag.get("total_area_harvested_ha", 0)
                    total_production += muni_ag.get("total_production_tons", 0)

            avg_yield = (total_production / total_harvested) if total_harvested > 0 else None

            return {
                "success": True,
                "data": {
                    "department": {
                        "dane_code": department_code,
                        "name": department.get("name"),
                    },
                    "year": year,
                    "crops": all_crops,
                    "total_area_planted_ha": round(total_planted, 2),
                    "total_area_harvested_ha": round(total_harvested, 2),
                    "total_production_tons": round(total_production, 2),
                    "average_yield_t_ha": round(avg_yield, 2) if avg_yield else None,
                },
            }

        elif tool_name == "search_crop":
            crop = arguments.get("crop", "").lower()
            year = arguments.get("year", 2024)

            # For now, search across all data (department filter can be added later)
            from supabase import create_client

            from app.services.supabase_service import supabase_service

            if not supabase_service.is_configured():
                return {"success": False, "error": "Database not configured"}

            client = create_client(supabase_service.url, supabase_service.key)

            try:
                response = (
                    client.table("agricultural_stats")
                    .select("*")
                    .eq("year", year)
                    .limit(100)
                    .execute()
                )

                if not response.data:
                    return {"success": True, "data": []}

                # Filter by crop name (case-insensitive)
                results = []
                for stat in response.data:
                    crop_name = stat.get("crop_name", "").lower()
                    if crop in crop_name:
                        results.append(stat)

                return {"success": True, "data": results[:50]}

            except Exception as e:
                logger.error(f"Search crop error: {str(e)}")
                return {"success": False, "error": f"Search failed: {str(e)}"}

        elif tool_name == "get_municipality_farms":
            municipality_code = arguments.get("municipality_code")
            result = await get_municipality_farms(municipality_code)
            return {"success": True, "data": result}

        else:
            return {"success": False, "error": f"Unknown tool: {tool_name}"}

    except Exception as e:
        logger.error(f"Tool execution error ({tool_name}): {str(e)}")
        return {"success": False, "error": str(e)}
