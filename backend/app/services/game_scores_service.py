"""Business logic for public mini-game scores."""

import logging
from typing import Optional
from uuid import UUID

from app.repositories.game_scores_repository import GameScoresRepository
from app.schemas.game_scores import (
    BestScoreEntry,
    GameScoreCreate,
    GameScoreRecord,
    LeaderboardEntry,
    LeaderboardResponse,
    PlayerBestResponse,
    PlayerHistoryResponse,
)

logger = logging.getLogger(__name__)

repository = GameScoresRepository()

MAX_LEADERBOARD_LIMIT = 50
DEFAULT_LEADERBOARD_LIMIT = 10
MAX_HISTORY_LIMIT = 20


async def save_score(payload: GameScoreCreate, user_id: Optional[UUID] = None) -> GameScoreRecord:
    """Guarda una partida validada. user_id llega del token validado, nunca del payload."""
    data = {
        "player_id": str(payload.player_id),
        "user_id": str(user_id) if user_id else None,
        "player_alias": payload.player_alias,
        "game_slug": payload.game_slug,
        "difficulty": payload.difficulty,
        "score": payload.score,
        "correct_answers": payload.correct_answers,
        "wrong_answers": payload.wrong_answers,
        "best_streak": payload.best_streak,
        "lives_remaining": payload.lives_remaining,
        "duration_seconds": payload.duration_seconds,
        "metadata": payload.metadata,
    }
    row = await repository.insert_score(data)
    return GameScoreRecord(**row)


async def get_leaderboard(
    game_slug: str,
    difficulty: Optional[str] = None,
    limit: int = DEFAULT_LEADERBOARD_LIMIT,
) -> LeaderboardResponse:
    """Top de partidas: score DESC, desempate created_at ASC."""
    limit = max(1, min(limit, MAX_LEADERBOARD_LIMIT))
    rows = await repository.get_leaderboard(game_slug, difficulty, limit)
    entries = [
        LeaderboardEntry(
            rank=index,
            id=row["id"],
            player_alias=row.get("player_alias"),
            score=row["score"],
            difficulty=row.get("difficulty"),
            created_at=row["created_at"],
        )
        for index, row in enumerate(rows, start=1)
    ]
    return LeaderboardResponse(
        game_slug=game_slug,
        difficulty=difficulty,
        limit=limit,
        count=len(entries),
        data=entries,
    )


async def get_player_best(player_id: UUID) -> PlayerBestResponse:
    """Mejor puntaje del jugador por juego (las filas vienen ordenadas por score DESC)."""
    rows = await repository.get_player_best_candidates(player_id)
    best: dict[str, BestScoreEntry] = {}
    for row in rows:
        slug = row["game_slug"]
        if slug not in best:
            best[slug] = BestScoreEntry(
                score=row["score"],
                difficulty=row.get("difficulty"),
                created_at=row["created_at"],
            )
    return PlayerBestResponse(player_id=player_id, best=best)


async def get_player_history(player_id: UUID, limit: int = MAX_HISTORY_LIMIT) -> PlayerHistoryResponse:
    """Partidas recientes del jugador (máximo 20)."""
    limit = max(1, min(limit, MAX_HISTORY_LIMIT))
    rows = await repository.get_player_scores(player_id, limit)
    records = [GameScoreRecord(**row) for row in rows]
    return PlayerHistoryResponse(player_id=player_id, count=len(records), data=records)
