"""
UPRA Geographic Reference Service client.

Consumes geographic data from UPRA ArcGIS REST API.
Service: referencia_geografica/referencia_geografica/MapServer
"""

import logging
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class GeoUnit(BaseModel):
    """Geographic unit from UPRA service."""

    dane_code: str
    name: str
    geojson: dict[str, Any]


class UPRAGeoClient:
    """Client for UPRA Geographic Reference Service."""

    DEPARTMENTS_LAYER = 7
    MUNICIPALITIES_LAYER = 8
    POPULATION_CENTERS_LAYER = 9

    def __init__(
        self,
        host: str = "geoservicios.upra.gov.co",
        service_path: str = "/arcgis/rest/services/referencia_geografica/referencia_geografica/MapServer",
    ):
        self.host = host
        self.service_path = service_path
        self.base_url = f"https://{host}{service_path}"

    async def query_layer(
        self,
        layer_id: int,
        where: str = "1=1",
        return_geometry: bool = True,
        out_sr: int = 4326,
        timeout: int = 60,
    ) -> list[dict[str, Any]]:
        """Query a specific layer from UPRA service."""

        url = f"{self.base_url}/{layer_id}/query"

        params = {
            "where": where,
            "outFields": "*",
            "returnGeometry": "true" if return_geometry else "false",
            "outSR": out_sr,
            "f": "geojson",
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()

                data = response.json()
                features = data.get("features", [])
                logger.info(f"Fetched {len(features)} features from layer {layer_id}")
                return features

        except httpx.HTTPError as e:
            logger.error(f"UPRA GEO API error: {str(e)}")
            raise

    async def get_departments(self) -> list[GeoUnit]:
        """Fetch all departments with geometry."""

        features = await self.query_layer(self.DEPARTMENTS_LAYER)
        result = []

        for feature in features:
            props = feature.get("properties", {})
            geometry = feature.get("geometry", {})

            try:
                # Map UPRA field names to our model
                dane_code = props.get("cod_depart") or props.get("CODIGO") or ""
                name = props.get("nombre") or props.get("NOMBRE") or ""

                if dane_code and name:
                    result.append(
                        GeoUnit(
                            dane_code=str(dane_code),
                            name=str(name),
                            geojson=geometry,
                        )
                    )
            except Exception as e:
                logger.warning(f"Failed to parse department feature: {e}")
                continue

        logger.info(f"Parsed {len(result)} departments")
        return result

    async def get_municipalities(self, department_code: Optional[str] = None) -> list[GeoUnit]:
        """Fetch municipalities with geometry, optionally filtered by department."""

        if department_code:
            where = f"cod_dane_depto = '{department_code}'"
        else:
            where = "1=1"

        features = await self.query_layer(self.MUNICIPALITIES_LAYER, where=where)
        result = []

        for feature in features:
            props = feature.get("properties", {})
            geometry = feature.get("geometry", {})

            try:
                dane_code = props.get("cod_dane_mpio") or props.get("CODIGO") or ""
                name = props.get("municipio") or props.get("NOMBRE") or ""

                if dane_code and name:
                    result.append(
                        GeoUnit(
                            dane_code=str(dane_code),
                            name=str(name),
                            geojson=geometry,
                        )
                    )
            except Exception as e:
                logger.warning(f"Failed to parse municipality feature: {e}")
                continue

        logger.info(f"Parsed {len(result)} municipalities")
        return result

    async def get_population_centers(self) -> list[dict[str, Any]]:
        """Fetch population centers (conceptual veredas/corregimientos)."""

        features = await self.query_layer(self.POPULATION_CENTERS_LAYER)
        logger.info(f"Fetched {len(features)} population centers")
        return features
