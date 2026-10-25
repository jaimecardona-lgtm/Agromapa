"""Rankings de juegos: nacional, departamental y municipal; por juego y general.

Reglas:
- Por usuario y juego cuenta solo el MEJOR puntaje. Las partidas no se suman.
- El general de un usuario es la suma de sus mejores puntajes por juego (un juego sin partidas suma 0).
- Empate: misma posición compartida (1, 2, 2, 4).
- El territorio sale del perfil del usuario (profiles.department_code / municipality_code), nunca del cliente
  para calcular la posición propia.
- Solo se exponen posición, nombre público, puntaje y territorio. Nunca email, teléfono ni user_id.
"""

import logging
import re
from typing import Optional
from uuid import UUID

from app.repositories.game_scores_repository import GameScoresRepository
from app.repositories.geo_repository import GeoRepository
from app.schemas.rankings import (
    MyRankingResponse,
    RankingEntry,
    RankingResponse,
    RankPosition,
    TerritoryInfo,
)

logger = logging.getLogger(__name__)

GAME_SLUGS = ("cosechas", "eco-puzzle", "cazadores-residuos")
GENERAL = "general"
SCOPES = ("national", "department", "municipality")
DEFAULT_DISPLAY_NAME = "Jugador"
_EMAIL_LIKE = re.compile(r"@")

repository = GameScoresRepository()
geo_repo = GeoRepository()


class RankingRequestError(Exception):
    """Petición de ranking inválida o territorio inexistente. El router la convierte en HTTP."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def public_display_name(raw: Optional[str]) -> str:
    """Nombre público seguro. Nunca un email como fallback."""
    value = (raw or "").strip()
    if not value or _EMAIL_LIKE.search(value):
        return DEFAULT_DISPLAY_NAME
    return value[:40]


# ---------- funciones puras (sin I/O) ----------


def best_by_user(rows: list[dict]) -> dict[str, dict]:
    """Mejor partida por usuario. Empate de puntaje: gana la primera registrada."""
    bests: dict[str, dict] = {}
    for row in rows:
        user_key = str(row["user_id"])
        candidate = {
            "score": int(row["score"]),
            "difficulty": row.get("difficulty"),
            "created_at": row["created_at"],
        }
        current = bests.get(user_key)
        if (
            current is None
            or candidate["score"] > current["score"]
            or (candidate["score"] == current["score"] and str(candidate["created_at"]) < str(current["created_at"]))
        ):
            bests[user_key] = candidate
    return bests


def general_totals(per_game: dict[str, dict[str, dict]]) -> dict[str, int]:
    """Suma de los mejores puntajes de cada usuario en cada juego."""
    totals: dict[str, int] = {}
    for bests in per_game.values():
        for user_key, best in bests.items():
            totals[user_key] = totals.get(user_key, 0) + best["score"]
    return totals


def competition_ranks(scores: dict[str, int]) -> dict[str, int]:
    """Posición con empate compartido: 1, 2, 2, 4."""
    first_index: dict[int, int] = {}
    for position, score in enumerate(sorted(scores.values(), reverse=True), start=1):
        first_index.setdefault(score, position)
    return {user_key: first_index[score] for user_key, score in scores.items()}


def _sort_key(user_key: str, score: int, created: Optional[str]) -> tuple:
    return (-score, created or "", user_key)


def _ordered(scores: dict[str, int], created_by_user: dict[str, Optional[str]]) -> list[str]:
    return sorted(scores, key=lambda key: _sort_key(key, scores[key], created_by_user.get(key)))


def _created_for_general(per_game: dict[str, dict[str, dict]]) -> dict[str, Optional[str]]:
    created: dict[str, Optional[str]] = {}
    for bests in per_game.values():
        for user_key, best in bests.items():
            value = str(best["created_at"])
            if user_key not in created or value < (created[user_key] or ""):
                created[user_key] = value
    return created


# ---------- acceso a datos + composición ----------


async def _game_bests(game: str, user_ids: Optional[list[str]]) -> dict[str, dict]:
    return best_by_user(await repository.list_registered_scores(game, user_ids))


async def _territory_names(department_code: Optional[str], municipality_code: Optional[str]) -> TerritoryInfo:
    info = TerritoryInfo(department_code=department_code, municipality_code=municipality_code)
    if department_code:
        dept = await geo_repo.get_by_dane_code("department", department_code)
        info.department_name = dept.get("name") if dept else None
    if municipality_code:
        muni = await geo_repo.get_by_dane_code("municipality", municipality_code)
        info.municipality_name = muni.get("name") if muni else None
    return info


def validate_scope(scope: str, game: str, department_code: Optional[str], municipality_code: Optional[str]) -> None:
    if scope not in SCOPES:
        raise RankingRequestError(422, "scope debe ser national, department o municipality")
    if game != GENERAL and game not in GAME_SLUGS:
        raise RankingRequestError(422, "juego no válido")
    if scope == "department" and not department_code:
        raise RankingRequestError(422, "department_code es obligatorio para scope=department")
    if scope == "municipality" and not municipality_code:
        raise RankingRequestError(422, "municipality_code es obligatorio para scope=municipality")


async def get_ranking(
    scope: str,
    game: str,
    department_code: Optional[str] = None,
    municipality_code: Optional[str] = None,
    limit: int = 10,
    viewer_user_id: Optional[UUID] = None,
) -> RankingResponse:
    validate_scope(scope, game, department_code, municipality_code)
    dept = department_code if scope == "department" else None
    muni = municipality_code if scope == "municipality" else None
    territory = await _territory_names(dept, muni)
    if scope == "department" and territory.department_name is None:
        raise RankingRequestError(404, "Departamento no encontrado")
    if scope == "municipality" and territory.municipality_name is None:
        raise RankingRequestError(404, "Municipio no encontrado")

    population: Optional[list[str]] = None
    if scope != "national":
        profiles = await repository.list_territory_profiles(department_code=dept, municipality_code=muni)
        population = [str(row["id"]) for row in profiles]

    if game == GENERAL:
        per_game = {slug: await _game_bests(slug, population) for slug in GAME_SLUGS}
        scores = general_totals(per_game)
        created = _created_for_general(per_game)
    else:
        bests = await _game_bests(game, population)
        scores = {key: best["score"] for key, best in bests.items()}
        created = {key: str(best["created_at"]) for key, best in bests.items()}

    ranks = competition_ranks(scores)
    ordered = _ordered(scores, created)[: max(1, min(limit, 50))]
    profiles_by_id = await repository.get_profiles_by_ids(ordered)

    entries: list[RankingEntry] = []
    for key in ordered:
        profile = profiles_by_id.get(key, {})
        entries.append(
            RankingEntry(
                rank=ranks[key],
                display_name=public_display_name(profile.get("display_name")),
                score=scores[key],
                department_code=profile.get("department_code"),
                municipality_code=profile.get("municipality_code"),
                is_me=viewer_user_id is not None and key == str(viewer_user_id),
            )
        )

    return RankingResponse(
        scope=scope,
        game=game,
        territory=territory,
        count=len(entries),
        entries=entries,
    )


async def get_my_ranking(user_id: UUID, profile: dict) -> MyRankingResponse:
    """Posiciones del usuario autenticado. El territorio sale de su perfil."""
    user_key = str(user_id)
    department_code = profile.get("department_code")
    municipality_code = profile.get("municipality_code")

    per_game = {slug: await _game_bests(slug, None) for slug in GAME_SLUGS}
    totals = general_totals(per_game)

    best = {slug: (per_game[slug][user_key]["score"] if user_key in per_game[slug] else None) for slug in GAME_SLUGS}
    general = totals.get(user_key)

    positions: dict[str, Optional[RankPosition]] = {"national": None, "department": None, "municipality": None}
    if general is not None:
        positions["national"] = _position(user_key, totals)

    missing: list[str] = []
    if department_code:
        department_profiles = await repository.list_territory_profiles(department_code=department_code)
        department_totals = {
            str(row["id"]): totals[str(row["id"])] for row in department_profiles if str(row["id"]) in totals
        }
        if general is not None and user_key in department_totals:
            positions["department"] = _position(user_key, department_totals)
    else:
        missing.append("department")

    if municipality_code:
        municipality_profiles = await repository.list_territory_profiles(municipality_code=municipality_code)
        municipality_totals = {
            str(row["id"]): totals[str(row["id"])] for row in municipality_profiles if str(row["id"]) in totals
        }
        if general is not None and user_key in municipality_totals:
            positions["municipality"] = _position(user_key, municipality_totals)
    else:
        missing.append("municipality")

    territory = await _territory_names(department_code, municipality_code)
    return MyRankingResponse(
        has_scores=general is not None,
        best=best,
        general=general,
        territory=territory,
        positions=positions,
        missing_territory=missing,
    )


def _position(user_key: str, scores: dict[str, int]) -> RankPosition:
    ranks = competition_ranks(scores)
    return RankPosition(rank=ranks[user_key], of=len(scores))
