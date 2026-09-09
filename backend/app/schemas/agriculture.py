"""Pydantic schemas for agricultural statistics."""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class AgriculturalCrop(BaseModel):
    """Individual crop record representing EVA statistical observations."""

    model_config = ConfigDict(extra="ignore")

    crop_name: str
    crop_code: Optional[str] = None
    crop_group: Optional[str] = None
    crop_subgroup: Optional[str] = None
    crop_cycle: Optional[str] = None
    crop_disaggregation: Optional[str] = None
    period: Optional[str] = None
    crop_physical_state: Optional[str] = None
    crop_scientific_name: Optional[str] = None
    area_planted_ha: Optional[float] = None
    area_harvested_ha: Optional[float] = None
    production_tons: Optional[float] = None
    yield_t_ha: Optional[float] = None


class MunicipalityRef(BaseModel):
    """Municipality reference in agricultural response."""

    dane_code: str
    name: str


class SourceRef(BaseModel):
    """Source reference in agricultural response."""

    id: str
    name: str


class AgriculturalData(BaseModel):
    """Aggregated agricultural statistics response for a municipality."""

    municipality: MunicipalityRef
    year: int
    source: SourceRef
    crops: List[AgriculturalCrop]
    total_area_planted_ha: Optional[float] = 0.0
    total_area_harvested_ha: Optional[float] = 0.0
    total_production_tons: Optional[float] = 0.0
    average_yield_t_ha: Optional[float] = None


class MunicipalityAgricultureResponse(BaseModel):
    """Response wrapper for municipality agricultural statistics."""

    data: Optional[AgriculturalData] = None
    message: Optional[str] = None
