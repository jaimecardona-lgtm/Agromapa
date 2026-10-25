"""Schemas for internal buyer-producer conversations.

Identity fields (buyer_user_id, producer_user_id, sender_user_id) never appear in
request bodies: extra="forbid" rejects them with 422, and the backend derives them
from the validated token and the offer chain.
"""

import re
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_MESSAGE_LENGTH = 2000
MESSAGES_PAGE_LIMIT = 200

ConversationStatus = Literal["active", "closed", "archived"]
ConversationRole = Literal["buyer", "producer"]

_HTML_TAG = re.compile(r"<\s*/?\s*[A-Za-z!][^>]*>")


class ConversationCreate(BaseModel):
    """Inicio de conversación: solo la oferta. Comprador y productor los resuelve el backend."""

    model_config = ConfigDict(extra="forbid")

    offer_id: UUID


class MessageCreate(BaseModel):
    """Mensaje de texto plano. El remitente sale del token."""

    model_config = ConfigDict(extra="forbid")

    body: str = Field(max_length=MAX_MESSAGE_LENGTH)

    @field_validator("body")
    @classmethod
    def _plain_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El mensaje no puede estar vacío.")
        if len(cleaned) > MAX_MESSAGE_LENGTH:
            raise ValueError(f"El mensaje no puede superar {MAX_MESSAGE_LENGTH} caracteres.")
        if _HTML_TAG.search(cleaned):
            raise ValueError("El mensaje no puede contener etiquetas HTML.")
        return cleaned


class ConversationStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ConversationStatus


class ConversationOfferSummary(BaseModel):
    """Contexto de la oferta. Sin datos de contacto."""

    crop_name: Optional[str] = None
    farm_name: Optional[str] = None
    municipality_name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    status: Optional[str] = None


class ConversationSummary(BaseModel):
    id: UUID
    offer_id: Optional[UUID] = None
    farm_id: Optional[UUID] = None
    status: ConversationStatus
    my_role: ConversationRole
    counterpart_name: str
    offer: Optional[ConversationOfferSummary] = None
    last_message_body: Optional[str] = None
    last_message_at: Optional[datetime] = None
    last_message_is_mine: bool = False
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    body: str
    sender_is_me: bool
    created_at: datetime
    read_at: Optional[datetime] = None


class MessageListResponse(BaseModel):
    data: list[MessageResponse]


class MarkReadResponse(BaseModel):
    marked: int
