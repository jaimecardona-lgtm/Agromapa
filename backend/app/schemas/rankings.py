"""Respuestas de ranking. Solo posición, nombre público, puntaje y territorio.

Por diseño NO existen campos de email, teléfono, user_id ni datos de contacto.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field

RankingScope = Literal["national", "department", "municipality"]
RankingGame = Literal["general", "cosechas", "eco-puzzle", "cazadores-residuos"]


class TerritoryInfo(BaseModel):
    department_code: Optional[str] = None
    department_name: Optional[str] = None
    municipality_code: Optional[str] = None
    municipality_name: Optional[str] = None


class RankingEntry(BaseModel):
    rank: int
    display_name: str
    score: int
    department_code: Optional[str] = None
    municipality_code: Optional[str] = None
    is_me: bool = False


class RankingResponse(BaseModel):
    scope: RankingScope
    game: RankingGame
    territory: TerritoryInfo
    count: int
    entries: list[RankingEntry]


class RankPosition(BaseModel):
    rank: int
    of: int = Field(ge=1)


class MyRankingResponse(BaseModel):
    has_scores: bool
    best: dict[str, Optional[int]]
    general: Optional[int] = None
    territory: TerritoryInfo
    positions: dict[str, Optional[RankPosition]]
    missing_territory: list[str]
