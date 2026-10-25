"""Business rules for conversations between buyers and producers.

Trust rules:
- buyer_user_id comes from the validated token (the caller must hold the buyer role,
  enforced by the router).
- producer_user_id is resolved server-side: offer -> farm_crop -> farm -> producer -> user_id.
- Only the two participants may read or write a conversation. Others get 403.
- Sender is always the authenticated user; the request body cannot choose it.
"""

import logging
from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException

from app.core.auth import AuthUser
from app.repositories.conversations_repository import conversations_repository
from app.repositories.operational_repository import OperationalRepository
from app.schemas.conversations import (
    MESSAGES_PAGE_LIMIT,
    ConversationOfferSummary,
    ConversationStatus,
    ConversationSummary,
    MessageResponse,
)

logger = logging.getLogger(__name__)

op_repo = OperationalRepository()

MESSAGING_UNAVAILABLE_DETAIL = "Este productor aún no tiene una cuenta vinculada para mensajería interna."
SELF_CONVERSATION_DETAIL = "No puedes iniciar una conversación contigo mismo."
OFFER_UNAVAILABLE_DETAIL = "Esta oferta ya no está disponible."
CLOSED_DETAIL = "Esta conversación está cerrada."
NO_ACCESS_DETAIL = "No tienes acceso a esta conversación."
DUPLICATE_ACTIVE_DETAIL = "Ya existe una conversación activa para esta oferta."


# ========== OFFER CHAIN ==========


async def _load_offer_chain(offer_id: UUID) -> Optional[dict]:
    """offer -> farm_crop -> farm -> producer -> municipality. None si la oferta no existe."""
    offer = await op_repo.get_row(
        "production_offers",
        offer_id,
        "id,farm_crop_id,status,available_quantity,unit,availability_start,availability_end",
    )
    if offer is None:
        return None

    crop = await op_repo.get_row("farm_crops", offer["farm_crop_id"], "id,farm_id,crop_name")
    farm = (
        await op_repo.get_row("farms", crop["farm_id"], "id,producer_id,name,municipality_id,active")
        if crop
        else None
    )
    producer = (
        await op_repo.get_row("producers", farm["producer_id"], "id,user_id,active,name")
        if farm and farm.get("producer_id")
        else None
    )
    municipality = (
        await op_repo.get_row("geo_units", farm["municipality_id"], "id,name")
        if farm and farm.get("municipality_id")
        else None
    )
    return {"offer": offer, "crop": crop, "farm": farm, "producer": producer, "municipality": municipality}


def _offer_is_open(chain: dict) -> bool:
    offer, farm, producer = chain["offer"], chain["farm"], chain["producer"]
    if offer.get("status") != "available" or farm is None or producer is None:
        return False
    if not farm.get("active") or not producer.get("active"):
        return False
    today = date.today()
    start, end = offer.get("availability_start"), offer.get("availability_end")
    if start and str(start)[:10] > today.isoformat():
        return False
    if end and str(end)[:10] < today.isoformat():
        return False
    return True


def _offer_snapshot(chain: Optional[dict]) -> Optional[ConversationOfferSummary]:
    if chain is None:
        return None
    crop = chain["crop"] or {}
    farm = chain["farm"] or {}
    municipality = chain["municipality"] or {}
    offer = chain["offer"]
    return ConversationOfferSummary(
        crop_name=crop.get("crop_name"),
        farm_name=farm.get("name"),
        municipality_name=municipality.get("name"),
        quantity=offer.get("available_quantity"),
        unit=offer.get("unit"),
        status=offer.get("status"),
    )


# ========== ROLE IN CONVERSATION ==========


def _my_role(row: dict, user_id: UUID) -> Optional[str]:
    if str(row["buyer_user_id"]) == str(user_id):
        return "buyer"
    if str(row["producer_user_id"]) == str(user_id):
        return "producer"
    return None


async def _require_participant(conversation_id: UUID, user: AuthUser) -> tuple[dict, str]:
    row = await conversations_repository.get_conversation(conversation_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Conversación no encontrada")
    role = _my_role(row, user.id)
    if role is None:
        raise HTTPException(status_code=403, detail=NO_ACCESS_DETAIL)
    return row, role


# ========== SUMMARIES ==========


async def _summaries(rows: list[dict], user_id: UUID) -> list[ConversationSummary]:
    counterpart_ids = {
        str(row["producer_user_id"] if _my_role(row, user_id) == "buyer" else row["buyer_user_id"])
        for row in rows
    }
    names = await conversations_repository.get_profile_names(list(counterpart_ids))

    offer_cache: dict[str, Optional[ConversationOfferSummary]] = {}
    summaries: list[ConversationSummary] = []
    for row in rows:
        role = _my_role(row, user_id)
        counterpart_id = str(row["producer_user_id"] if role == "buyer" else row["buyer_user_id"])

        offer_key = str(row["offer_id"]) if row.get("offer_id") else ""
        if offer_key and offer_key not in offer_cache:
            offer_cache[offer_key] = _offer_snapshot(await _load_offer_chain(UUID(offer_key)))

        last = await conversations_repository.last_message(UUID(str(row["id"])))
        unread = await conversations_repository.count_unread(UUID(str(row["id"])), user_id)

        summaries.append(
            ConversationSummary(
                id=row["id"],
                offer_id=row.get("offer_id"),
                farm_id=row.get("farm_id"),
                status=row["status"],
                my_role=role,
                counterpart_name=names.get(counterpart_id) or "Usuario",
                offer=offer_cache.get(offer_key) if offer_key else None,
                last_message_body=last["body"] if last else None,
                last_message_at=last["created_at"] if last else None,
                last_message_is_mine=bool(last and str(last["sender_user_id"]) == str(user_id)),
                unread_count=unread,
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
        )
    return summaries


async def _summarize(row: dict, user_id: UUID) -> ConversationSummary:
    return (await _summaries([row], user_id))[0]


# ========== COMMANDS ==========


async def start_conversation(user: AuthUser, offer_id: UUID) -> tuple[ConversationSummary, bool]:
    """Devuelve (conversación, creada). Si ya existe una activa para esta oferta, la devuelve."""
    chain = await _load_offer_chain(offer_id)
    if chain is None:
        raise HTTPException(status_code=404, detail="Oferta no encontrada")
    if not _offer_is_open(chain):
        raise HTTPException(status_code=409, detail=OFFER_UNAVAILABLE_DETAIL)

    producer_user_id = chain["producer"].get("user_id")
    if producer_user_id is None:
        raise HTTPException(status_code=409, detail=MESSAGING_UNAVAILABLE_DETAIL)
    if str(producer_user_id) == str(user.id):
        raise HTTPException(status_code=409, detail=SELF_CONVERSATION_DETAIL)

    producer_uuid = UUID(str(producer_user_id))
    existing = await conversations_repository.find_active_conversation(user.id, producer_uuid, offer_id)
    if existing:
        return await _summarize(existing, user.id), False

    data = {
        "buyer_user_id": str(user.id),
        "producer_user_id": str(producer_uuid),
        "offer_id": str(offer_id),
        "farm_id": str(chain["farm"]["id"]),
        "status": "active",
    }
    try:
        row = await conversations_repository.insert_conversation(data)
    except Exception:
        # Otra petición creó la misma conversación activa a la vez: se reutiliza.
        existing = await conversations_repository.find_active_conversation(user.id, producer_uuid, offer_id)
        if existing is None:
            raise
        return await _summarize(existing, user.id), False
    return await _summarize(row, user.id), True


async def list_conversations(user: AuthUser) -> list[ConversationSummary]:
    rows = await conversations_repository.list_conversations_for_user(user.id)
    return await _summaries(rows, user.id)


async def get_conversation(user: AuthUser, conversation_id: UUID) -> ConversationSummary:
    row, _ = await _require_participant(conversation_id, user)
    return await _summarize(row, user.id)


async def list_messages(user: AuthUser, conversation_id: UUID) -> list[MessageResponse]:
    await _require_participant(conversation_id, user)
    rows = await conversations_repository.list_messages(conversation_id, MESSAGES_PAGE_LIMIT)
    return [_to_message_response(row, user.id) for row in rows]


async def send_message(user: AuthUser, conversation_id: UUID, body: str) -> MessageResponse:
    row, _ = await _require_participant(conversation_id, user)
    if row["status"] != "active":
        raise HTTPException(status_code=409, detail=CLOSED_DETAIL)

    message = await conversations_repository.insert_message(
        {"conversation_id": str(conversation_id), "sender_user_id": str(user.id), "body": body}
    )
    await conversations_repository.update_conversation(
        conversation_id, {"updated_at": datetime.now(timezone.utc).isoformat()}
    )
    return _to_message_response(message, user.id)


async def mark_read(user: AuthUser, conversation_id: UUID) -> int:
    await _require_participant(conversation_id, user)
    return await conversations_repository.mark_read(conversation_id, user.id)


async def set_status(user: AuthUser, conversation_id: UUID, status: ConversationStatus) -> ConversationSummary:
    """Cualquier participante puede cerrar, archivar o reactivar la conversación."""
    row, _ = await _require_participant(conversation_id, user)
    if row["status"] != status:
        try:
            row = await conversations_repository.update_conversation(conversation_id, {"status": status})
        except Exception as exc:
            if status == "active" and ("23505" in str(exc) or "duplicate" in str(exc).lower()):
                raise HTTPException(status_code=409, detail=DUPLICATE_ACTIVE_DETAIL)
            raise
        if row is None:
            raise HTTPException(status_code=404, detail="Conversación no encontrada")
    return await _summarize(row, user.id)


def _to_message_response(row: dict, user_id: UUID) -> MessageResponse:
    return MessageResponse(
        id=row["id"],
        conversation_id=row["conversation_id"],
        body=row["body"],
        sender_is_me=str(row["sender_user_id"]) == str(user_id),
        created_at=row["created_at"],
        read_at=row.get("read_at"),
    )
