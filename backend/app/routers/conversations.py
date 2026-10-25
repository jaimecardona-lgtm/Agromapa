"""Conversation routes (/api/conversations).

Every route derives the caller from the validated token. Reading and writing is
limited to the two participants of a conversation (403 for anyone else).
Starting a conversation requires the buyer role, so a producer-only account
cannot open one as buyer. A producer with both roles can.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.core.auth import ROLE_BUYER, AuthUser, require_role, require_user
from app.schemas.conversations import (
    ConversationCreate,
    ConversationStatusUpdate,
    ConversationSummary,
    MarkReadResponse,
    MessageCreate,
    MessageListResponse,
    MessageResponse,
)
from app.services import conversations_service

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationSummary, status_code=201)
async def start_conversation(
    payload: ConversationCreate,
    response: Response,
    user: AuthUser = Depends(require_role(ROLE_BUYER)),
):
    """Inicia (o reutiliza la activa) una conversación sobre una oferta. Solo body: offer_id."""
    summary, created = await conversations_service.start_conversation(user, payload.offer_id)
    if not created:
        response.status_code = 200
    return summary


@router.get("", response_model=list[ConversationSummary])
async def list_conversations(user: AuthUser = Depends(require_user)):
    """Conversaciones del usuario, como comprador o como productor."""
    return await conversations_service.list_conversations(user)


@router.get("/{conversation_id}", response_model=ConversationSummary)
async def get_conversation(conversation_id: UUID, user: AuthUser = Depends(require_user)):
    return await conversations_service.get_conversation(user, conversation_id)


@router.get("/{conversation_id}/messages", response_model=MessageListResponse)
async def list_messages(conversation_id: UUID, user: AuthUser = Depends(require_user)):
    data = await conversations_service.list_messages(user, conversation_id)
    return MessageListResponse(data=data)


@router.post("/{conversation_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    conversation_id: UUID,
    payload: MessageCreate,
    user: AuthUser = Depends(require_user),
):
    """Envía un mensaje. El remitente sale del token; el body solo tiene `body`."""
    return await conversations_service.send_message(user, conversation_id, payload.body)


@router.patch("/{conversation_id}/read", response_model=MarkReadResponse)
async def mark_messages_read(conversation_id: UUID, user: AuthUser = Depends(require_user)):
    """Marca como leídos los mensajes recibidos del otro participante."""
    marked = await conversations_service.mark_read(user, conversation_id)
    return MarkReadResponse(marked=marked)


@router.patch("/{conversation_id}/status", response_model=ConversationSummary)
async def update_conversation_status(
    conversation_id: UUID,
    payload: ConversationStatusUpdate,
    user: AuthUser = Depends(require_user),
):
    """Cierra, archiva o reactiva. Solo participantes."""
    return await conversations_service.set_status(user, conversation_id, payload.status)
