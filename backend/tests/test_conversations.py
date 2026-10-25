"""Conversations and messages: authorization, ownership and spoof resistance.

Supabase and Auth are replaced by in-memory fakes. Tokens have the form
"tok-<user uuid>", so every request can act as any user without real Auth.
"""

import copy
from datetime import datetime, timedelta, timezone
from itertools import count
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import AuthInvalidToken, AuthUser
from app.main import app
from app.repositories.conversations_repository import ConversationsRepository
from app.repositories.identity_repository import identity_repository
from app.repositories.operational_repository import OperationalRepository

BUYER = uuid4()
PRODUCER_USER = uuid4()  # productor con cuenta vinculada
BOTH = uuid4()  # productor y comprador a la vez
PRODUCER_ONLY = uuid4()  # solo rol productor
THIRD = uuid4()  # tercero sin relación
LEGACY_PRODUCER = uuid4()  # productor histórico sin cuenta

PRODUCER_ID = uuid4()
BOTH_PRODUCER_ID = uuid4()
LEGACY_PRODUCER_ID = uuid4()
FARM_ID = uuid4()
BOTH_FARM_ID = uuid4()
LEGACY_FARM_ID = uuid4()
MUNICIPALITY_ID = uuid4()
CROP_ID = uuid4()
BOTH_CROP_ID = uuid4()
LEGACY_CROP_ID = uuid4()
OFFER_ID = uuid4()
BOTH_OFFER_ID = uuid4()
LEGACY_OFFER_ID = uuid4()
SOLD_OFFER_ID = uuid4()

ROLES = {
    str(BUYER): ["buyer"],
    str(PRODUCER_USER): ["producer"],
    str(BOTH): ["producer", "buyer"],
    str(PRODUCER_ONLY): ["producer"],
    str(LEGACY_PRODUCER): ["producer"],
}
PROFILE_NAMES = {
    str(BUYER): "Comprador Ana",
    str(PRODUCER_USER): "Productor Luis",
    str(BOTH): "Doble Rol",
    str(PRODUCER_ONLY): "Solo Productor",
    str(THIRD): "Tercero",
}

TS = datetime(2026, 10, 1, tzinfo=timezone.utc).isoformat()
FUTURE = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()

STORE: dict[str, dict[str, dict]] = {}
CONVERSATIONS: dict[str, dict] = {}
MESSAGES: list[dict] = []
_ids = count(1)


def _next_time() -> str:
    return (datetime(2026, 10, 1, tzinfo=timezone.utc) + timedelta(seconds=next(_ids))).isoformat()


def _seed():
    STORE.clear()
    CONVERSATIONS.clear()
    MESSAGES.clear()
    STORE["geo_units"] = {str(MUNICIPALITY_ID): {"id": str(MUNICIPALITY_ID), "name": "Cali"}}
    STORE["producers"] = {
        str(PRODUCER_ID): {"id": str(PRODUCER_ID), "name": "Finca Luis", "user_id": str(PRODUCER_USER), "active": True},
        str(BOTH_PRODUCER_ID): {"id": str(BOTH_PRODUCER_ID), "name": "Finca Doble", "user_id": str(BOTH), "active": True},
        str(LEGACY_PRODUCER_ID): {"id": str(LEGACY_PRODUCER_ID), "name": "Histórico", "user_id": None, "active": True},
    }
    STORE["farms"] = {
        str(FARM_ID): {
            "id": str(FARM_ID),
            "producer_id": str(PRODUCER_ID),
            "name": "La Esperanza",
            "municipality_id": str(MUNICIPALITY_ID),
            "active": True,
        },
        str(BOTH_FARM_ID): {
            "id": str(BOTH_FARM_ID),
            "producer_id": str(BOTH_PRODUCER_ID),
            "name": "Finca Doble",
            "municipality_id": str(MUNICIPALITY_ID),
            "active": True,
        },
        str(LEGACY_FARM_ID): {
            "id": str(LEGACY_FARM_ID),
            "producer_id": str(LEGACY_PRODUCER_ID),
            "name": "Finca Histórica",
            "municipality_id": str(MUNICIPALITY_ID),
            "active": True,
        },
    }
    STORE["farm_crops"] = {
        str(CROP_ID): {"id": str(CROP_ID), "farm_id": str(FARM_ID), "crop_name": "Café"},
        str(BOTH_CROP_ID): {"id": str(BOTH_CROP_ID), "farm_id": str(BOTH_FARM_ID), "crop_name": "Cacao"},
        str(LEGACY_CROP_ID): {"id": str(LEGACY_CROP_ID), "farm_id": str(LEGACY_FARM_ID), "crop_name": "Plátano"},
    }
    STORE["production_offers"] = {
        str(OFFER_ID): _offer(OFFER_ID, CROP_ID),
        str(BOTH_OFFER_ID): _offer(BOTH_OFFER_ID, BOTH_CROP_ID),
        str(LEGACY_OFFER_ID): _offer(LEGACY_OFFER_ID, LEGACY_CROP_ID),
        str(SOLD_OFFER_ID): _offer(SOLD_OFFER_ID, CROP_ID, status="sold_out"),
    }


def _offer(offer_id, crop_id, status="available"):
    return {
        "id": str(offer_id),
        "farm_crop_id": str(crop_id),
        "available_quantity": 120,
        "unit": "kg",
        "status": status,
        "availability_start": None,
        "availability_end": FUTURE,
    }


# ========== FAKES ==========


async def fake_get_row(self, table, row_id, columns="*"):
    row = STORE.get(table, {}).get(str(row_id))
    return copy.deepcopy(row) if row else None


async def fake_verify(token):
    if token == "bad":
        raise AuthInvalidToken("rechazado")
    return AuthUser(id=UUID(token.removeprefix("tok-")), email=None)


async def fake_roles(user_id):
    return list(ROLES.get(str(user_id), []))


async def fake_get_conversation(self, conversation_id):
    row = CONVERSATIONS.get(str(conversation_id))
    return copy.deepcopy(row) if row else None


async def fake_find_active(self, buyer_user_id, producer_user_id, offer_id):
    for row in CONVERSATIONS.values():
        if (
            row["buyer_user_id"] == str(buyer_user_id)
            and row["producer_user_id"] == str(producer_user_id)
            and row["offer_id"] == str(offer_id)
            and row["status"] == "active"
        ):
            return copy.deepcopy(row)
    return None


def _check_duplicate(row):
    if row["status"] != "active" or not row.get("offer_id"):
        return
    for other in CONVERSATIONS.values():
        if (
            other["id"] != row["id"]
            and other["status"] == "active"
            and other["buyer_user_id"] == row["buyer_user_id"]
            and other["producer_user_id"] == row["producer_user_id"]
            and other["offer_id"] == row["offer_id"]
        ):
            raise Exception("duplicate key value violates unique constraint (23505)")


async def fake_insert_conversation(self, data):
    row = {**data, "id": str(uuid4()), "created_at": _next_time(), "updated_at": _next_time()}
    row.setdefault("offer_id", None)
    _check_duplicate(row)
    CONVERSATIONS[row["id"]] = row
    return copy.deepcopy(row)


async def fake_update_conversation(self, conversation_id, data):
    row = CONVERSATIONS.get(str(conversation_id))
    if row is None:
        return None
    candidate = {**row, **data}
    _check_duplicate(candidate)
    candidate["updated_at"] = _next_time()
    CONVERSATIONS[str(conversation_id)] = candidate
    return copy.deepcopy(candidate)


async def fake_list_for_user(self, user_id):
    rows = [
        r for r in CONVERSATIONS.values() if str(user_id) in (r["buyer_user_id"], r["producer_user_id"])
    ]
    return [copy.deepcopy(r) for r in sorted(rows, key=lambda r: r["updated_at"], reverse=True)]


async def fake_profile_names(self, user_ids):
    return {uid: PROFILE_NAMES[uid] for uid in user_ids if uid in PROFILE_NAMES}


async def fake_last_message(self, conversation_id):
    items = [m for m in MESSAGES if m["conversation_id"] == str(conversation_id)]
    return copy.deepcopy(items[-1]) if items else None


async def fake_count_unread(self, conversation_id, reader_user_id):
    return sum(
        1
        for m in MESSAGES
        if m["conversation_id"] == str(conversation_id)
        and m["read_at"] is None
        and m["sender_user_id"] != str(reader_user_id)
    )


async def fake_list_messages(self, conversation_id, limit):
    items = [m for m in MESSAGES if m["conversation_id"] == str(conversation_id)]
    return [copy.deepcopy(m) for m in items[-limit:]]


async def fake_insert_message(self, data):
    row = {**data, "id": str(uuid4()), "created_at": _next_time(), "read_at": None}
    MESSAGES.append(row)
    return copy.deepcopy(row)


async def fake_mark_read(self, conversation_id, reader_user_id):
    marked = 0
    for m in MESSAGES:
        if (
            m["conversation_id"] == str(conversation_id)
            and m["read_at"] is None
            and m["sender_user_id"] != str(reader_user_id)
        ):
            m["read_at"] = _next_time()
            marked += 1
    return marked


# ========== FIXTURES ==========


@pytest.fixture(autouse=True)
def _fakes():
    _seed()
    with (
        patch.object(auth_module, "verify_access_token", fake_verify),
        patch.object(identity_repository, "list_role_names", fake_roles),
        patch.object(OperationalRepository, "get_row", fake_get_row),
        patch.object(ConversationsRepository, "get_conversation", fake_get_conversation),
        patch.object(ConversationsRepository, "find_active_conversation", fake_find_active),
        patch.object(ConversationsRepository, "insert_conversation", fake_insert_conversation),
        patch.object(ConversationsRepository, "update_conversation", fake_update_conversation),
        patch.object(ConversationsRepository, "list_conversations_for_user", fake_list_for_user),
        patch.object(ConversationsRepository, "get_profile_names", fake_profile_names),
        patch.object(ConversationsRepository, "last_message", fake_last_message),
        patch.object(ConversationsRepository, "count_unread", fake_count_unread),
        patch.object(ConversationsRepository, "list_messages", fake_list_messages),
        patch.object(ConversationsRepository, "insert_message", fake_insert_message),
        patch.object(ConversationsRepository, "mark_read", fake_mark_read),
    ):
        yield


@pytest.fixture
def client():
    return TestClient(app)


def _auth(user_id):
    return {"Authorization": f"Bearer tok-{user_id}"}


def _start(client, user_id, offer_id):
    return client.post("/api/conversations", headers=_auth(user_id), json={"offer_id": str(offer_id)})


def _open_conversation(client):
    """Buyer opens a conversation on the main offer. Returns its id."""
    response = _start(client, BUYER, OFFER_ID)
    assert response.status_code == 201
    return response.json()["id"]


# ========== CREATE ==========


def test_buyer_creates_conversation_and_producer_is_resolved_server_side(client):
    response = _start(client, BUYER, OFFER_ID)

    assert response.status_code == 201
    body = response.json()
    assert body["my_role"] == "buyer"
    assert body["counterpart_name"] == "Productor Luis"
    assert body["status"] == "active"
    stored = next(iter(CONVERSATIONS.values()))
    assert stored["buyer_user_id"] == str(BUYER)
    assert stored["producer_user_id"] == str(PRODUCER_USER)
    assert stored["offer_id"] == str(OFFER_ID)
    assert stored["farm_id"] == str(FARM_ID)


def test_anonymous_cannot_start_conversation(client):
    response = client.post("/api/conversations", json={"offer_id": str(OFFER_ID)})
    assert response.status_code == 401


def test_invalid_token_cannot_start_conversation(client):
    response = client.post(
        "/api/conversations",
        headers={"Authorization": "Bearer bad"},
        json={"offer_id": str(OFFER_ID)},
    )
    assert response.status_code == 401


def test_producer_without_buyer_role_cannot_start_purchase(client):
    response = _start(client, PRODUCER_ONLY, OFFER_ID)
    assert response.status_code == 403
    assert CONVERSATIONS == {}


def test_client_cannot_send_buyer_or_producer_ids(client):
    response = client.post(
        "/api/conversations",
        headers=_auth(BUYER),
        json={"offer_id": str(OFFER_ID), "buyer_user_id": str(THIRD), "producer_user_id": str(BUYER)},
    )
    assert response.status_code == 422
    assert CONVERSATIONS == {}


def test_offer_with_producer_without_linked_account_is_rejected(client):
    response = _start(client, BUYER, LEGACY_OFFER_ID)

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Este productor aún no tiene una cuenta vinculada para mensajería interna."
    )


def test_user_cannot_start_conversation_with_own_offer(client):
    response = _start(client, BOTH, BOTH_OFFER_ID)

    assert response.status_code == 409
    assert response.json()["detail"] == "No puedes iniciar una conversación contigo mismo."


def test_unavailable_offer_cannot_start_conversation(client):
    response = _start(client, BUYER, SOLD_OFFER_ID)
    assert response.status_code == 409


def test_unknown_offer_returns_404(client):
    response = _start(client, BUYER, uuid4())
    assert response.status_code == 404


def test_duplicate_active_conversation_is_reused(client):
    first = _start(client, BUYER, OFFER_ID)
    second = _start(client, BUYER, OFFER_ID)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert len(CONVERSATIONS) == 1


def test_duplicate_is_reused_when_insert_loses_a_race(client):
    """Si otra petición insertó primero, el DB rechaza la segunda y se devuelve la existente."""
    first = _start(client, BUYER, OFFER_ID).json()
    real_find = ConversationsRepository.find_active_conversation

    calls = {"n": 0}

    async def find_then_miss(self, buyer, producer, offer):
        calls["n"] += 1
        if calls["n"] == 1:
            return None  # la primera lectura no ve la fila que acaba de insertar otra petición
        return await real_find(self, buyer, producer, offer)

    with patch.object(ConversationsRepository, "find_active_conversation", find_then_miss):
        response = _start(client, BUYER, OFFER_ID)

    assert response.status_code == 200
    assert response.json()["id"] == first["id"]


def test_closed_conversation_allows_a_new_one_for_same_offer(client):
    first = _open_conversation(client)
    client.patch(f"/api/conversations/{first}/status", headers=_auth(BUYER), json={"status": "closed"})

    response = _start(client, BUYER, OFFER_ID)

    assert response.status_code == 201
    assert response.json()["id"] != first


# ========== LIST AND READ ==========


def test_list_returns_only_own_conversations_with_role(client):
    buyer_conv = _open_conversation(client)  # BUYER <-> PRODUCER_USER
    other_conv = _start(client, BOTH, OFFER_ID).json()["id"]  # BOTH <-> PRODUCER_USER, ajena para BUYER

    buyer_list = client.get("/api/conversations", headers=_auth(BUYER)).json()
    producer_list = client.get("/api/conversations", headers=_auth(PRODUCER_USER)).json()
    third_list = client.get("/api/conversations", headers=_auth(THIRD)).json()

    assert [c["id"] for c in buyer_list] == [buyer_conv]
    assert buyer_list[0]["my_role"] == "buyer"
    assert {c["id"] for c in producer_list} == {buyer_conv, other_conv}
    assert {c["my_role"] for c in producer_list} == {"producer"}
    assert {c["counterpart_name"] for c in producer_list} == {"Comprador Ana", "Doble Rol"}
    assert third_list == []


def test_list_requires_authentication(client):
    assert client.get("/api/conversations").status_code == 401


def test_third_party_cannot_read_conversation(client):
    conversation_id = _open_conversation(client)

    response = client.get(f"/api/conversations/{conversation_id}", headers=_auth(THIRD))

    assert response.status_code == 403


def test_participants_can_read_conversation(client):
    conversation_id = _open_conversation(client)

    assert client.get(f"/api/conversations/{conversation_id}", headers=_auth(BUYER)).status_code == 200
    assert client.get(f"/api/conversations/{conversation_id}", headers=_auth(PRODUCER_USER)).status_code == 200


def test_unknown_conversation_returns_404(client):
    response = client.get(f"/api/conversations/{uuid4()}", headers=_auth(BUYER))
    assert response.status_code == 404


def test_third_party_cannot_read_messages(client):
    conversation_id = _open_conversation(client)
    client.post(
        f"/api/conversations/{conversation_id}/messages", headers=_auth(BUYER), json={"body": "Hola"}
    )

    response = client.get(f"/api/conversations/{conversation_id}/messages", headers=_auth(THIRD))

    assert response.status_code == 403


# ========== MESSAGES ==========


def test_participant_sends_message_and_sender_comes_from_token(client):
    conversation_id = _open_conversation(client)

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(BUYER),
        json={"body": "  ¿Sigue disponible?  "},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["body"] == "¿Sigue disponible?"
    assert body["sender_is_me"] is True
    assert "sender_user_id" not in body
    assert MESSAGES[0]["sender_user_id"] == str(BUYER)


def test_sender_spoof_is_impossible(client):
    conversation_id = _open_conversation(client)

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(THIRD),
        json={"body": "Hola", "sender_user_id": str(BUYER)},
    )

    assert response.status_code == 422
    assert MESSAGES == []


def test_third_party_cannot_send_message(client):
    conversation_id = _open_conversation(client)

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(THIRD),
        json={"body": "Hola"},
    )

    assert response.status_code == 403
    assert MESSAGES == []


def test_producer_participant_receives_and_replies(client):
    conversation_id = _open_conversation(client)
    client.post(f"/api/conversations/{conversation_id}/messages", headers=_auth(BUYER), json={"body": "Hola"})

    producer_view = client.get(f"/api/conversations/{conversation_id}/messages", headers=_auth(PRODUCER_USER))
    reply = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(PRODUCER_USER),
        json={"body": "Sí, disponible"},
    )

    assert producer_view.status_code == 200
    assert producer_view.json()["data"][0]["sender_is_me"] is False
    assert reply.status_code == 201
    assert reply.json()["sender_is_me"] is True


def test_messages_are_listed_in_chronological_order(client):
    conversation_id = _open_conversation(client)
    for text in ["uno", "dos", "tres"]:
        client.post(f"/api/conversations/{conversation_id}/messages", headers=_auth(BUYER), json={"body": text})

    data = client.get(f"/api/conversations/{conversation_id}/messages", headers=_auth(BUYER)).json()["data"]

    assert [m["body"] for m in data] == ["uno", "dos", "tres"]


@pytest.mark.parametrize("body", ["", "   ", "\n\t"])
def test_empty_message_is_rejected(client, body):
    conversation_id = _open_conversation(client)

    response = client.post(
        f"/api/conversations/{conversation_id}/messages", headers=_auth(BUYER), json={"body": body}
    )

    assert response.status_code == 422
    assert MESSAGES == []


def test_message_longer_than_limit_is_rejected(client):
    conversation_id = _open_conversation(client)

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(BUYER),
        json={"body": "x" * 2001},
    )

    assert response.status_code == 422


def test_html_in_message_is_rejected(client):
    conversation_id = _open_conversation(client)

    response = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(BUYER),
        json={"body": "<img src=x onerror=alert(1)>"},
    )

    assert response.status_code == 422
    assert MESSAGES == []


# ========== READ MARKERS AND STATUS ==========


def test_mark_read_only_affects_messages_from_counterpart(client):
    conversation_id = _open_conversation(client)
    client.post(f"/api/conversations/{conversation_id}/messages", headers=_auth(BUYER), json={"body": "uno"})
    client.post(f"/api/conversations/{conversation_id}/messages", headers=_auth(BUYER), json={"body": "dos"})
    client.post(f"/api/conversations/{conversation_id}/messages", headers=_auth(PRODUCER_USER), json={"body": "tres"})

    before = client.get(f"/api/conversations/{conversation_id}", headers=_auth(PRODUCER_USER)).json()
    marked = client.patch(f"/api/conversations/{conversation_id}/read", headers=_auth(PRODUCER_USER))
    after = client.get(f"/api/conversations/{conversation_id}", headers=_auth(PRODUCER_USER)).json()

    assert before["unread_count"] == 2
    assert marked.json() == {"marked": 2}
    assert after["unread_count"] == 0


def test_third_party_cannot_mark_read(client):
    conversation_id = _open_conversation(client)
    response = client.patch(f"/api/conversations/{conversation_id}/read", headers=_auth(THIRD))
    assert response.status_code == 403


def test_participant_can_close_conversation_and_then_cannot_send(client):
    conversation_id = _open_conversation(client)

    closed = client.patch(
        f"/api/conversations/{conversation_id}/status", headers=_auth(PRODUCER_USER), json={"status": "closed"}
    )
    blocked = client.post(
        f"/api/conversations/{conversation_id}/messages", headers=_auth(BUYER), json={"body": "Hola"}
    )

    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
    assert blocked.status_code == 409


def test_third_party_cannot_change_status(client):
    conversation_id = _open_conversation(client)
    response = client.patch(
        f"/api/conversations/{conversation_id}/status", headers=_auth(THIRD), json={"status": "closed"}
    )
    assert response.status_code == 403


def test_invalid_status_is_rejected(client):
    conversation_id = _open_conversation(client)
    response = client.patch(
        f"/api/conversations/{conversation_id}/status", headers=_auth(BUYER), json={"status": "deleted"}
    )
    assert response.status_code == 422


def test_reopening_is_blocked_when_another_active_conversation_exists(client):
    first = _open_conversation(client)
    client.patch(f"/api/conversations/{first}/status", headers=_auth(BUYER), json={"status": "closed"})
    _open_conversation(client)  # nueva activa para la misma oferta

    response = client.patch(f"/api/conversations/{first}/status", headers=_auth(BUYER), json={"status": "active"})

    assert response.status_code == 409


def test_user_with_both_roles_buys_and_receives_in_separate_conversations(client):
    bought = _start(client, BOTH, OFFER_ID)  # BOTH compra al productor PRODUCER_USER
    received = _start(client, BUYER, BOTH_OFFER_ID)  # BUYER compra a BOTH, que vende

    assert bought.status_code == 201
    assert received.status_code == 201
    roles = {c["id"]: c["my_role"] for c in client.get("/api/conversations", headers=_auth(BOTH)).json()}
    assert roles == {bought.json()["id"]: "buyer", received.json()["id"]: "producer"}

    reply = client.post(
        f"/api/conversations/{received.json()['id']}/messages",
        headers=_auth(BOTH),
        json={"body": "Sí, tengo cacao disponible"},
    )
    assert reply.status_code == 201
    assert reply.json()["sender_is_me"] is True
