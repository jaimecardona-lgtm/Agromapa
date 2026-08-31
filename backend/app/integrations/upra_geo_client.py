"""
UPRA Geographic Reference Service client.

Consumes geographic data from UPRA ArcGIS REST API.
Service: referencia_geografica/referencia_geografica/MapServer
"""

import asyncio
import logging
from typing import Any, Optional

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class GeoUnit(BaseModel):
    """Geographic unit from UPRA service."""

    dane_code: str
    name: str
    geojson: dict[str, Any]
    department_dane_code: str | None = None


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

    async def _get_layer_metadata(self, layer_id: int) -> dict[str, Any]:
        """Get layer metadata to find objectIdField."""

        url = f"{self.base_url}/{layer_id}"
        params = {"f": "json"}

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch layer metadata: {e}")
            raise

    async def _get_object_ids(
        self, layer_id: int, where: str = "1=1"
    ) -> list[int]:
        """Query only object IDs from layer."""

        url = f"{self.base_url}/{layer_id}/query"
        params = {
            "where": where,
            "returnIdsOnly": "true",
            "f": "json",
        }

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                object_ids = data.get("objectIds", [])
                logger.info(f"Retrieved {len(object_ids)} object IDs from layer {layer_id}")
                return object_ids
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch object IDs: {e}")
            raise

    async def _query_objects_by_ids(
        self,
        layer_id: int,
        object_ids: list[int],
        object_id_field: str = "OBJECTID",
        max_retries: int = 3,
    ) -> list[dict[str, Any]]:
        """Query features by object IDs with retry logic."""

        url = f"{self.base_url}/{layer_id}/query"
        ids_str = ",".join(str(oid) for oid in object_ids)

        params = {
            "where": f"{object_id_field} IN ({ids_str})",
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": 4326,
            "f": "geojson",
        }

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=120) as client:
                    response = await client.get(url, params=params)
                    response.raise_for_status()
                    data = response.json()
                    features = data.get("features", [])
                    return features
            except httpx.HTTPError as e:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.warning(
                        f"Batch query failed (attempt {attempt + 1}/{max_retries}), "
                        f"retrying in {wait_time}s: {e}"
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"Batch query failed after {max_retries} attempts")
                    raise

        return []

    async def get_municipalities(self, department_code: Optional[str] = None) -> list[GeoUnit]:
        """Fetch municipalities with geometry using batch processing."""

        batch_size = 100

        if department_code:
            where = f"cod_dane_depto = '{department_code}'"
        else:
            where = "1=1"

        try:
            metadata = await self._get_layer_metadata(self.MUNICIPALITIES_LAYER)
            object_id_field = metadata.get("objectIdField", "OBJECTID")
            logger.info(f"Using objectIdField: {object_id_field}")

            object_ids = await self._get_object_ids(self.MUNICIPALITIES_LAYER, where=where)
            logger.info(f"Total municipality IDs: {len(object_ids)}")

            all_features = []
            total_batches = (len(object_ids) + batch_size - 1) // batch_size

            for i in range(0, len(object_ids), batch_size):
                batch_num = i // batch_size + 1
                batch_ids = object_ids[i : i + batch_size]
                logger.info(f"Fetching municipality batch {batch_num}/{total_batches}")

                try:
                    features = await self._query_objects_by_ids(
                        self.MUNICIPALITIES_LAYER,
                        batch_ids,
                        object_id_field=object_id_field,
                    )
                    all_features.extend(features)
                    logger.info(f"Fetched {len(features)} features in batch {batch_num}")
                except Exception as e:
                    logger.error(f"Failed batch {batch_num}: {e}")

            result = []
            for feature in all_features:
                props = feature.get("properties", {})
                geometry = feature.get("geometry", {})

                try:
                    dane_code = props.get("cod_dane_mpio") or props.get("CODIGO") or ""
                    name = props.get("municipio") or props.get("NOMBRE") or ""
                    dept_code = props.get("cod_dane_depto") or ""

                    if dane_code and name:
                        result.append(
                            GeoUnit(
                                dane_code=str(dane_code),
                                name=str(name),
                                geojson=geometry,
                                department_dane_code=str(dept_code) if dept_code else None,
                            )
                        )
                except Exception as e:
                    logger.warning(f"Failed to parse municipality feature: {e}")
                    continue

            logger.info(f"Parsed {len(result)} municipalities from {len(all_features)} features")
            return result

        except Exception as e:
            logger.error(f"Failed to fetch municipalities: {e}")
            raise

    async def get_population_centers(self) -> list[dict[str, Any]]:
        """Fetch population centers (conceptual veredas/corregimientos)."""

        features = await self.query_layer(self.POPULATION_CENTERS_LAYER)
        logger.info(f"Fetched {len(features)} population centers")
        return features
