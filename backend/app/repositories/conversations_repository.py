"""Repository for conversations and messages (tables conversations, messages).

Uses the administrative Supabase client, so it is only called from the backend.
Callers pass user IDs taken from a validated token, never from request data.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

CONVERSATIONS = "conversations"
MESSAGES = "messages"
MESSAGE_COLUMNS = "id,conversation_id,sender_user_id,body,created_at,read_at"


class ConversationsRepository:
    def _client(self):
        return supabase_service.get_client()

    # ========== CONVERSATIONS ==========

    async def get_conversation(self, conversation_id: UUID) -> Optional[dict]:
        response = (
            self._client()
            .table(CONVERSATIONS)
            .select("*")
            .eq("id", str(conversation_id))
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None

    async def find_active_conversation(
        self, buyer_user_id: UUID, producer_user_id: UUID, offer_id: UUID
    ) -> Optional[dict]:
        response = (
            self._client()
            .table(CONVERSATIONS)
            .select("*")
            .eq("buyer_user_id", str(buyer_user_id))
            .eq("producer_user_id", str(producer_user_id))
            .eq("offer_id", str(offer_id))
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None

    async def insert_conversation(self, data: dict) -> dict:
        response = self._client().table(CONVERSATIONS).insert(data).execute()
        if not response.data:
            raise RuntimeError("Supabase no devolvió la conversación creada")
        return response.data[0]

    async def update_conversation(self, conversation_id: UUID, data: dict) -> Optional[dict]:
        response = (
            self._client()
            .table(CONVERSATIONS)
            .update(data)
            .eq("id", str(conversation_id))
            .execute()
        )
        return response.data[0] if response.data else None

    async def list_conversations_for_user(self, user_id: UUID) -> list[dict]:
        """Conversaciones donde el usuario es comprador o productor, más recientes primero."""
        response = (
            self._client()
            .table(CONVERSATIONS)
            .select("*")
            .or_(f"buyer_user_id.eq.{user_id},producer_user_id.eq.{user_id}")
            .order("updated_at", desc=True)
            .execute()
        )
        return response.data or []

    async def get_profile_names(self, user_ids: list[str]) -> dict[str, str]:
        """Nombre público (display_name) por user_id. Nunca email."""
        if not user_ids:
            return {}
        response = (
            self._client()
            .table("profiles")
            .select("id,display_name")
            .in_("id", user_ids)
            .execute()
        )
        return {str(row["id"]): row["display_name"] for row in (response.data or [])}

    # ========== MESSAGES ==========

    async def last_message(self, conversation_id: UUID) -> Optional[dict]:
        response = (
            self._client()
            .table(MESSAGES)
            .select(MESSAGE_COLUMNS)
            .eq("conversation_id", str(conversation_id))
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return response.data[0] if response.data else None

    async def count_unread(self, conversation_id: UUID, reader_user_id: UUID) -> int:
        """Mensajes del otro participante que aún no están leídos."""
        response = (
            self._client()
            .table(MESSAGES)
            .select("id")
            .eq("conversation_id", str(conversation_id))
            .is_("read_at", "null")
            .neq("sender_user_id", str(reader_user_id))
            .execute()
        )
        return len(response.data or [])

    async def list_messages(self, conversation_id: UUID, limit: int) -> list[dict]:
        """Últimos `limit` mensajes, devueltos en orden cronológico ascendente."""
        response = (
            self._client()
            .table(MESSAGES)
            .select(MESSAGE_COLUMNS)
            .eq("conversation_id", str(conversation_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return list(reversed(response.data or []))

    async def insert_message(self, data: dict) -> dict:
        response = self._client().table(MESSAGES).insert(data).execute()
        if not response.data:
            raise RuntimeError("Supabase no devolvió el mensaje creado")
        return response.data[0]

    async def mark_read(self, conversation_id: UUID, reader_user_id: UUID) -> int:
        """Marca como leídos los mensajes del otro participante. Devuelve cuántos cambió."""
        now = datetime.now(timezone.utc).isoformat()
        response = (
            self._client()
            .table(MESSAGES)
            .update({"read_at": now})
            .eq("conversation_id", str(conversation_id))
            .is_("read_at", "null")
            .neq("sender_user_id", str(reader_user_id))
            .execute()
        )
        return len(response.data or [])


conversations_repository = ConversationsRepository()
