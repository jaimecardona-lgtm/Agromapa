"""Repository for public mini-game scores (table game_scores)."""

import logging
from typing import Optional
from uuid import UUID

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

TABLE = "game_scores"
RECORD_COLUMNS = (
    "id,player_alias,game_slug,difficulty,score,correct_answers,wrong_answers,"
    "best_streak,lives_remaining,duration_seconds,created_at"
)


class GameScoresRepository:
    """Acceso a game_scores. Usa la clave administrativa solo desde el backend."""

    def _client(self):
        return supabase_service.get_client()

    async def insert_score(self, data: dict) -> dict:
        response = self._client().table(TABLE).insert(data).execute()
        if not response.data:
            raise RuntimeError("Supabase no devolvió la partida insertada")
        return response.data[0]

    async def get_leaderboard(
        self,
        game_slug: str,
        difficulty: Optional[str],
        limit: int,
    ) -> list[dict]:
        query = (
            self._client()
            .table(TABLE)
            .select(RECORD_COLUMNS)
            .eq("game_slug", game_slug)
        )
        if difficulty:
            query = query.eq("difficulty", difficulty)

        response = (
            query.order("score", desc=True)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return response.data or []

    async def get_player_scores(self, player_id: UUID, limit: int, offset: int = 0) -> list[dict]:
        response = (
            self._client()
            .table(TABLE)
            .select(RECORD_COLUMNS)
            .eq("player_id", str(player_id))
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return response.data or []

    async def get_player_best_candidates(self, player_id: UUID, limit: int = 500) -> list[dict]:
        """Filas del jugador ordenadas por puntaje; el servicio calcula el mejor por juego."""
        response = (
            self._client()
            .table(TABLE)
            .select("game_slug,difficulty,score,created_at")
            .eq("player_id", str(player_id))
            .order("score", desc=True)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return response.data or []
