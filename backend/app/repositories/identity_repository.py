"""Repository for identity: profiles, roles, producer/buyer profiles, guest score links.

Uses the administrative Supabase client, so it is only ever called from the backend.
Callers must pass user IDs taken from a validated token, never from request data.
"""

import logging
from typing import Optional
from uuid import UUID

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


class IdentityRepository:
    """Acceso a profiles, user_roles, producer_profiles, buyer_profiles y guest_score_claims."""

    def _client(self):
        return supabase_service.get_client()

    # ========== PROFILES ==========

    async def get_profile(self, user_id: UUID) -> Optional[dict]:
        response = (
            self._client().table("profiles").select("*").eq("id", str(user_id)).limit(1).execute()
        )
        return response.data[0] if response.data else None

    async def insert_profile(self, data: dict) -> dict:
        response = (
            self._client()
            .table("profiles")
            .upsert(data, on_conflict="id", ignore_duplicates=True)
            .execute()
        )
        if response.data:
            return response.data[0]
        # Ya existía (creación concurrente): se devuelve la fila actual.
        existing = await self.get_profile(UUID(str(data["id"])))
        if existing is None:
            raise RuntimeError("No se pudo crear el perfil")
        return existing

    async def update_profile(self, user_id: UUID, data: dict) -> Optional[dict]:
        response = (
            self._client().table("profiles").update(data).eq("id", str(user_id)).execute()
        )
        return response.data[0] if response.data else None

    # ========== ROLES ==========

    async def list_role_names(self, user_id: UUID) -> list[str]:
        response = (
            self._client().table("user_roles").select("role").eq("user_id", str(user_id)).execute()
        )
        return [row["role"] for row in (response.data or [])]

    async def add_role(self, user_id: UUID, role: str) -> None:
        self._client().table("user_roles").upsert(
            {"user_id": str(user_id), "role": role},
            on_conflict="user_id,role",
            ignore_duplicates=True,
        ).execute()

    async def remove_role(self, user_id: UUID, role: str) -> None:
        self._client().table("user_roles").delete().eq("user_id", str(user_id)).eq("role", role).execute()

    # ========== ROLE PROFILES ==========

    async def ensure_producer_profile(self, user_id: UUID) -> None:
        self._client().table("producer_profiles").upsert(
            {"user_id": str(user_id)}, on_conflict="user_id", ignore_duplicates=True
        ).execute()

    async def get_producer_profile(self, user_id: UUID) -> Optional[dict]:
        response = (
            self._client()
            .table("producer_profiles")
            .select("*")
            .eq("user_id", str(user_id))
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None

    async def update_producer_profile(self, user_id: UUID, data: dict) -> Optional[dict]:
        response = (
            self._client()
            .table("producer_profiles")
            .update(data)
            .eq("user_id", str(user_id))
            .execute()
        )
        return response.data[0] if response.data else None

    async def get_producer_profiles_by_users(self, user_ids: list[str]) -> dict[str, dict]:
        """Perfiles públicos de productor indexados por user_id. Lista vacía -> sin consulta."""
        if not user_ids:
            return {}
        response = (
            self._client()
            .table("producer_profiles")
            .select("user_id,business_name,description,public_phone,public_email,whatsapp,contact_visible,verified")
            .in_("user_id", user_ids)
            .execute()
        )
        return {str(row["user_id"]): row for row in (response.data or [])}

    async def ensure_buyer_profile(self, user_id: UUID) -> None:
        self._client().table("buyer_profiles").upsert(
            {"user_id": str(user_id)}, on_conflict="user_id", ignore_duplicates=True
        ).execute()

    async def get_buyer_profile(self, user_id: UUID) -> Optional[dict]:
        response = (
            self._client()
            .table("buyer_profiles")
            .select("*")
            .eq("user_id", str(user_id))
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None

    async def update_buyer_profile(self, user_id: UUID, data: dict) -> Optional[dict]:
        response = (
            self._client().table("buyer_profiles").update(data).eq("user_id", str(user_id)).execute()
        )
        return response.data[0] if response.data else None

    # ========== PRODUCERS (legacy table, linked by user_id) ==========

    async def get_producer_by_user(self, user_id: UUID) -> Optional[dict]:
        response = (
            self._client()
            .table("producers")
            .select("id,name,active,user_id")
            .eq("user_id", str(user_id))
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None

    async def insert_producer_for_user(self, user_id: UUID, name: str) -> dict:
        response = (
            self._client()
            .table("producers")
            .insert({"user_id": str(user_id), "name": name, "active": True})
            .execute()
        )
        if not response.data:
            raise RuntimeError("Supabase no devolvió el productor creado")
        return response.data[0]

    async def set_producer_active(self, producer_id: UUID, active: bool) -> None:
        self._client().table("producers").update({"active": active}).eq("id", str(producer_id)).execute()

    async def count_active_farms(self, producer_id: UUID) -> int:
        response = (
            self._client()
            .table("farms")
            .select("id")
            .eq("producer_id", str(producer_id))
            .eq("active", True)
            .execute()
        )
        return len(response.data or [])

    # ========== GUEST SCORE LINKS ==========

    async def get_guest_claim(self, player_id: UUID) -> Optional[dict]:
        response = (
            self._client()
            .table("guest_score_claims")
            .select("player_id,user_id")
            .eq("player_id", str(player_id))
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None

    async def insert_guest_claim(self, player_id: UUID, user_id: UUID) -> None:
        # La clave primaria decide: si otro usuario reclamó primero, la inserción falla.
        self._client().table("guest_score_claims").insert(
            {"player_id": str(player_id), "user_id": str(user_id)}
        ).execute()

    async def claim_guest_scores(self, player_id: UUID, user_id: UUID) -> int:
        """Asigna user_id a las partidas de ese player_id que aún no tienen cuenta."""
        response = (
            self._client()
            .table("game_scores")
            .update({"user_id": str(user_id)})
            .eq("player_id", str(player_id))
            .is_("user_id", "null")
            .execute()
        )
        return len(response.data or [])

    async def list_user_game_scores(self, user_id: UUID, limit: int) -> list[dict]:
        response = (
            self._client()
            .table("game_scores")
            .select(
                "id,player_alias,game_slug,difficulty,score,correct_answers,wrong_answers,"
                "best_streak,lives_remaining,duration_seconds,created_at"
            )
            .eq("user_id", str(user_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data or []


identity_repository = IdentityRepository()
