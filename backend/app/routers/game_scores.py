"""Public mini-game score routes (/api/games/...)."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import AuthUser, get_optional_user
from app.schemas.game_scores import (
    Difficulty,
    GameScoreCreate,
    GameScoreRecord,
    GameSlug,
    LeaderboardResponse,
    PlayerBestResponse,
    PlayerHistoryResponse,
    RegisteredLeaderboardResponse,
)
from app.services.game_scores_service import (
    DEFAULT_LEADERBOARD_LIMIT,
    MAX_HISTORY_LIMIT,
    MAX_LEADERBOARD_LIMIT,
    get_leaderboard,
    get_player_best,
    get_player_history,
    get_registered_leaderboard,
    save_score,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/games", tags=["games"])

UNAVAILABLE_DETAIL = "El registro de puntajes no está disponible en este momento."


def _unavailable(exc: Exception) -> HTTPException:
    # El detalle técnico queda en el log; el cliente recibe un mensaje genérico.
    logger.error("Game scores storage error: %s", exc)
    return HTTPException(status_code=503, detail=UNAVAILABLE_DETAIL)


@router.post("/scores", response_model=GameScoreRecord, status_code=201)
async def create_game_score(
    payload: GameScoreCreate,
    user: Optional[AuthUser] = Depends(get_optional_user),
):
    """Guarda una partida terminada. Invitado: user_id NULL. Con sesión válida: user_id del token."""
    try:
        return await save_score(payload, user_id=user.id if user else None)
    except Exception as exc:
        raise _unavailable(exc) from exc


@router.get("/leaderboard/{game_slug}", response_model=LeaderboardResponse)
async def read_leaderboard(
    game_slug: GameSlug,
    difficulty: Optional[Difficulty] = None,
    limit: int = Query(default=DEFAULT_LEADERBOARD_LIMIT, ge=1, le=MAX_LEADERBOARD_LIMIT),
):
    """Top de partidas de un juego, opcionalmente filtrado por dificultad."""
    try:
        return await get_leaderboard(game_slug, difficulty, limit)
    except Exception as exc:
        raise _unavailable(exc) from exc


@router.get("/leaderboard/{game_slug}/registered", response_model=RegisteredLeaderboardResponse)
async def read_registered_leaderboard(
    game_slug: GameSlug,
    difficulty: Optional[Difficulty] = None,
    country_code: Optional[str] = Query(default=None, pattern=r"^[A-Z]{2}$"),
    department_code: Optional[str] = Query(default=None, pattern=r"^[0-9]{2}$"),
    municipality_code: Optional[str] = Query(default=None, pattern=r"^[0-9]{5}$"),
    limit: int = Query(default=DEFAULT_LEADERBOARD_LIMIT, ge=1, le=MAX_LEADERBOARD_LIMIT),
):
    """Ranking de cuentas registradas (nombre público y territorio). Sin email. Filtros opcionales."""
    try:
        return await get_registered_leaderboard(
            game_slug, difficulty, country_code, department_code, municipality_code, limit
        )
    except Exception as exc:
        raise _unavailable(exc) from exc


@router.get("/player/{player_id}/best", response_model=PlayerBestResponse)
async def read_player_best(player_id: UUID):
    """Mejor puntaje del jugador por juego."""
    try:
        return await get_player_best(player_id)
    except Exception as exc:
        raise _unavailable(exc) from exc


@router.get("/player/{player_id}/history", response_model=PlayerHistoryResponse)
async def read_player_history(
    player_id: UUID,
    limit: int = Query(default=MAX_HISTORY_LIMIT, ge=1, le=MAX_HISTORY_LIMIT),
):
    """Partidas recientes del jugador (máximo 20)."""
    try:
        return await get_player_history(player_id, limit)
    except Exception as exc:
        raise _unavailable(exc) from exc
