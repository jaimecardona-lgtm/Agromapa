"""Repository for public mini-game scores (table game_scores)."""

import logging
from typing import Optional
from uuid import UUID

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

TABLE = "game_scores"
PROFILE_BATCH_SIZE = 100
RANKING_PAGE_SIZE = 1000
RANKING_USER_BATCH_SIZE = 200
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

    async def get_registered_candidates(
        self,
        game_slug: str,
        difficulty: Optional[str],
        limit: int,
    ) -> list[dict]:
        """Partidas de cuentas registradas (user_id no nulo), score DESC. Sin email."""
        query = (
            self._client()
            .table(TABLE)
            .select("user_id,score,difficulty,created_at")
            .eq("game_slug", game_slug)
            .not_.is_("user_id", "null")
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

    async def get_profiles_by_ids(self, user_ids: list[str]) -> dict[str, dict]:
        """Datos públicos de perfil por id, en lotes para no alargar la URL. Nunca email."""
        profiles: dict[str, dict] = {}
        for start in range(0, len(user_ids), PROFILE_BATCH_SIZE):
            batch = user_ids[start : start + PROFILE_BATCH_SIZE]
            response = (
                self._client()
                .table("profiles")
                .select("id,display_name,country_code,department_code,municipality_code")
                .in_("id", batch)
                .execute()
            )
            for row in response.data or []:
                profiles[str(row["id"])] = row
        return profiles

    # ========== RANKINGS (agregación en el servicio, sin tope de filas) ==========

    async def list_registered_scores(self, game_slug: str, user_ids: Optional[list[str]] = None) -> list[dict]:
        """Partidas de cuentas registradas de un juego (user_id no nulo), paginadas.

        Con user_ids, las consultas van en lotes para no alargar la URL. Sin tope de filas: un
        tope aplicado antes de filtrar por territorio dejaba jugadores fuera de su ranking.
        """
        if user_ids is None:
            return await self._page_registered_scores(game_slug, None)
        rows: list[dict] = []
        for start in range(0, len(user_ids), RANKING_USER_BATCH_SIZE):
            batch = user_ids[start : start + RANKING_USER_BATCH_SIZE]
            rows.extend(await self._page_registered_scores(game_slug, batch))
        return rows

    async def _page_registered_scores(self, game_slug: str, user_ids: Optional[list[str]]) -> list[dict]:
        rows: list[dict] = []
        offset = 0
        while True:
            query = (
                self._client()
                .table(TABLE)
                .select("user_id,score,difficulty,created_at")
                .eq("game_slug", game_slug)
                .not_.is_("user_id", "null")
            )
            if user_ids is not None:
                query = query.in_("user_id", user_ids)
            page = query.order("id").range(offset, offset + RANKING_PAGE_SIZE - 1).execute().data or []
            rows.extend(page)
            if len(page) < RANKING_PAGE_SIZE:
                return rows
            offset += RANKING_PAGE_SIZE

    async def list_territory_profiles(
        self, department_code: Optional[str] = None, municipality_code: Optional[str] = None
    ) -> list[dict]:
        """Perfiles de un territorio, filtrados en la base y paginados. Nunca email."""
        rows: list[dict] = []
        offset = 0
        while True:
            query = self._client().table("profiles").select(
                "id,display_name,country_code,department_code,municipality_code"
            )
            if department_code:
                query = query.eq("department_code", department_code)
            if municipality_code:
                query = query.eq("municipality_code", municipality_code)
            page = query.order("id").range(offset, offset + RANKING_PAGE_SIZE - 1).execute().data or []
            rows.extend(page)
            if len(page) < RANKING_PAGE_SIZE:
                return rows
            offset += RANKING_PAGE_SIZE
