"""
EVA (Evaluaciones Agropecuarias Municipales) data client.

Consumes data from Datos Abiertos Colombia Socrata API.
Resource: uejq-wxrr
"""

import hashlib
import json
import logging
from typing import AsyncGenerator, Optional

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class EVARecord(BaseModel):
    """EVA record from Socrata API."""

    dane_department_code: str = Field(alias="c_digo_dane_departamento")
    department: str = Field(alias="departamento")
    dane_municipality_code: str = Field(alias="c_digo_dane_municipio")
    municipality: str = Field(alias="municipio")
    crop_group: str = Field(alias="grupo_cultivo")
    subgroup: str = Field(alias="subgrupo")
    crop: str = Field(alias="cultivo")
    crop_desagregation: str = Field(alias="desagregaci_n_cultivo")
    year: int = Field(alias="a_o")
    period: Optional[str] = Field(alias="periodo")
    crop_cycle: Optional[str] = Field(None, alias="ciclo_del_cultivo")
    crop_physical_state: Optional[str] = Field(None, alias="estado_f_sico_del_cultivo")
    crop_code: Optional[str] = Field(None, alias="c_digo_del_cultivo")
    crop_scientific_name: Optional[str] = Field(None, alias="nombre_cient_fico_del_cultivo")
    area_planted: Optional[float] = Field(None, alias="rea_sembrada")
    area_harvested: Optional[float] = Field(None, alias="rea_cosechada")
    production: Optional[float] = Field(None, alias="producci_n")
    yield_value: Optional[float] = Field(None, alias="rendimiento")

    class Config:
        populate_by_name = True

    def generate_source_record_key(self) -> str:
        """
        Generate deterministic SHA-256 based source_record_key for EVA record deduplication.

        Uses EVA's official crop_code (stable identifier) rather than human-readable names.
        Canonical format ensures same record always produces identical key.

        Canonical fields (sorted):
        - municipality_dane
        - year
        - period
        - crop_cycle
        - crop_code
        - crop_disaggregation

        Returns: Full SHA-256 hex digest (64 hexadecimal characters)
        """
        canonical = {
            "municipality_dane": str(self.dane_municipality_code).strip(),
            "year": self.year,
            "period": str(self.period or "").strip(),
            "crop_cycle": str(self.crop_cycle or "").strip(),
            "crop_code": str(self.crop_code or "").strip(),
            "crop_disaggregation": str(self.crop_desagregation or "").strip(),
        }

        # JSON with sorted keys for deterministic representation
        canonical_json = json.dumps(canonical, sort_keys=True, ensure_ascii=False)
        hash_digest = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

        return hash_digest


class EVAClient:
    """Client for EVA Socrata API."""

    def __init__(
        self,
        host: str = "www.datos.gov.co",
        resource_id: str = "uejq-wxrr",
        app_token: Optional[str] = None,
    ):
        self.host = host
        self.resource_id = resource_id
        self.app_token = app_token
        self.base_url = f"https://{host}/resource/{resource_id}.json"

    async def get_records(
        self,
        year: int,
        limit: int = 5000,
        offset: int = 0,
        timeout: int = 30,
    ) -> list[EVARecord]:
        """Fetch EVA records for a specific year with pagination."""

        headers = {"Accept": "application/json"}
        if self.app_token:
            headers["X-App-Token"] = self.app_token

        params = {
            "$where": f"a_o = {year}",
            "$limit": limit,
            "$offset": offset,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(
                    self.base_url,
                    params=params,
                    headers=headers,
                )
                response.raise_for_status()

                data = response.json()
                records = [EVARecord(**record) for record in data]
                logger.info(f"Fetched {len(records)} EVA records for year {year}, offset {offset}")
                return records

        except httpx.HTTPError as e:
            logger.error(f"EVA API error: {str(e)}")
            raise

    async def paginate_year(
        self,
        year: int,
        limit: int = 5000,
        timeout: int = 30,
    ) -> AsyncGenerator[list[EVARecord], None]:
        """Paginate through all EVA records for a year."""

        offset = 0
        while True:
            records = await self.get_records(year, limit=limit, offset=offset, timeout=timeout)

            if not records:
                break

            yield records
            offset += limit

            if len(records) < limit:
                break

    async def get_all_years_available(self) -> list[int]:
        """Get list of available years in EVA dataset."""

        headers = {"Accept": "application/json"}
        if self.app_token:
            headers["X-App-Token"] = self.app_token

        params = {
            "$select": "a_o",
            "$group": "a_o",
            "$order": "a_o DESC",
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(
                    self.base_url,
                    params=params,
                    headers=headers,
                )
                response.raise_for_status()

                data = response.json()
                years = sorted([int(record["a_o"]) for record in data], reverse=True)
                logger.info(f"Available EVA years: {years}")
                return years

        except Exception as e:
            logger.error(f"Failed to get available years: {str(e)}")
            return []
