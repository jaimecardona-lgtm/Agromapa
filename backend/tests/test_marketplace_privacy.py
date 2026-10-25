"""Public marketplace privacy: contact only when contact_visible, never legacy or auth data.

No Supabase or Auth. Repositories are replaced by in-memory fakes that return the same
shape the real queries return, including the legacy phone/email columns that must not leak.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import AuthUser
from app.main import app
from app.repositories.identity_repository import identity_repository
from app.repositories.operational_repository import OperationalRepository

VISIBLE_USER = uuid4()
HIDDEN_USER = uuid4()
PROFILE_ONLY_USER = uuid4()
LEGACY_PRODUCER = uuid4()  # sin cuenta vinculada

VISIBLE_PRODUCER = uuid4()
HIDDEN_PRODUCER = uuid4()
PROFILE_ONLY_PRODUCER = uuid4()
INACTIVE_PRODUCER = uuid4()
TS = "2026-10-01T10:00:00+00:00"

LEGACY_PHONE = "3001112233"
LEGACY_EMAIL = "legacy@finca.example"
AUTH_EMAIL = "cuenta-auth@raices.example"

PRODUCERS = [
    {
        "id": str(VISIBLE_PRODUCER),
        "name": "Finca Visible",
        "user_id": str(VISIBLE_USER),
        "active": True,
        "phone": LEGACY_PHONE,
        "email": LEGACY_EMAIL,
        "document_number": "12345",
    },
    {
        "id": str(HIDDEN_PRODUCER),
        "name": "Finca Oculta",
        "user_id": str(HIDDEN_USER),
        "active": True,
        "phone": LEGACY_PHONE,
        "email": LEGACY_EMAIL,
        "document_number": "67890",
    },
    {
        "id": str(PROFILE_ONLY_PRODUCER),
        "name": "Finca Sin Contacto",
        "user_id": str(PROFILE_ONLY_USER),
        "active": True,
        "phone": LEGACY_PHONE,
        "email": LEGACY_EMAIL,
    },
    {
        "id": str(LEGACY_PRODUCER),
        "name": "Histórico",
        "user_id": None,
        "active": True,
        "phone": LEGACY_PHONE,
        "email": LEGACY_EMAIL,
    },
    {
        "id": str(INACTIVE_PRODUCER),
        "name": "Inactiva",
        "user_id": None,
        "active": False,
    },
]

PROFILES = {
    str(VISIBLE_USER): {
        "user_id": str(VISIBLE_USER),
        "business_name": "Café Visible",
        "description": "Café de altura",
        "public_phone": "3109998877",
        "public_email": "ventas@cafevisible.example",
        "whatsapp": "3109998877",
        "contact_visible": True,
        "verified": True,
    },
    str(HIDDEN_USER): {
        "user_id": str(HIDDEN_USER),
        "business_name": "Finca Oculta Comercial",
        "description": None,
        "public_phone": "3205556666",
        "public_email": "oculta@finca.example",
        "whatsapp": "3205556666",
        "contact_visible": False,
        "verified": False,
    },
    str(PROFILE_ONLY_USER): {
        "user_id": str(PROFILE_ONLY_USER),
        "business_name": None,
        "description": None,
        "public_phone": None,
        "public_email": None,
        "whatsapp": None,
        "contact_visible": True,
        "verified": False,
    },
}


def _offer_row(producer_id, producer_user_id, contact_visible, phone=None, email=None, whatsapp=None):
    """Fila de current_operational_offers tal como la devuelve la vista migrada (013)."""
    return {
        "id": str(uuid4()),
        "farm_crop_id": str(uuid4()),
        "farm_id": str(uuid4()),
        "farm_name": "La Esperanza",
        "producer_id": str(producer_id),
        "producer_user_id": str(producer_user_id) if producer_user_id else None,
        "producer_name": "Café Visible",
        "producer_verified": True,
        "producer_contact_visible": contact_visible,
        "public_phone": phone,
        "public_email": email,
        "whatsapp": whatsapp,
        "municipality_name": "Cali",
        "municipality_code": "76001",
        "crop_name": "Café",
        "quantity": 50,
        "unit": "kg",
        "available_from": None,
        "available_until": None,
        "price_per_unit": 9000,
        "expected_harvest_at": None,
        "harvested_at": None,
        "description": "Cosecha reciente",
        "notes": None,
        "status": "available",
        "source": "Raíces Conectadas",
        "data_type": "operational",
        "created_at": TS,
        "updated_at": TS,
    }


OFFERS = [
    _offer_row(VISIBLE_PRODUCER, VISIBLE_USER, True, "3109998877", "ventas@cafevisible.example", "3109998877"),
    # Contacto oculto: la vista devuelve NULL en los campos públicos y contact_visible=false.
    _offer_row(HIDDEN_PRODUCER, HIDDEN_USER, False),
    # Productor sin cuenta vinculada: no hay mensajería ni contacto público.
    _offer_row(LEGACY_PRODUCER, None, False),
]


async def fake_list_producers(self, columns="*"):
    return [dict(p) for p in PRODUCERS if p["active"]]


async def fake_get_producer_by_id(self, producer_id, columns="*"):
    for row in PRODUCERS:
        if row["id"] == str(producer_id):
            return dict(row)
    return None


async def fake_current_offers(self, **kwargs):
    return [dict(o) for o in OFFERS]


async def fake_profiles_by_users(user_ids):
    return {uid: PROFILES[uid] for uid in user_ids if uid in PROFILES}


@pytest.fixture(autouse=True)
def _fakes():
    with (
        patch.object(OperationalRepository, "list_producers", fake_list_producers),
        patch.object(OperationalRepository, "get_producer_by_id", fake_get_producer_by_id),
        patch.object(OperationalRepository, "get_current_operational_offers", fake_current_offers),
        patch.object(identity_repository, "get_producer_profiles_by_users", fake_profiles_by_users),
    ):
        yield


@pytest.fixture
def client():
    return TestClient(app)


def _producer_by_id(payload, producer_id):
    return next(p for p in payload if p["id"] == str(producer_id))


def _offer_by_producer(payload, producer_id):
    return next(o for o in payload["data"] if o["producer_id"] == str(producer_id))


# ========== PUBLIC PRODUCERS ==========


def test_public_producer_list_never_exposes_legacy_contact_or_documents(client):
    response = client.get("/api/operational/producers")
    text = response.text

    assert response.status_code == 200
    assert LEGACY_PHONE not in text
    assert LEGACY_EMAIL not in text
    assert "12345" not in text and "67890" not in text
    for item in response.json():
        assert set(item) == {"id", "display_name", "verified", "description", "contact", "messaging_available"}


def test_public_list_only_includes_active_producers(client):
    ids = {item["id"] for item in client.get("/api/operational/producers").json()}
    assert str(INACTIVE_PRODUCER) not in ids


def test_contact_is_shown_only_when_contact_visible(client):
    payload = client.get("/api/operational/producers").json()

    visible = _producer_by_id(payload, VISIBLE_PRODUCER)
    hidden = _producer_by_id(payload, HIDDEN_PRODUCER)

    assert visible["display_name"] == "Café Visible"
    assert visible["verified"] is True
    assert visible["contact"] == {
        "public_phone": "3109998877",
        "public_email": "ventas@cafevisible.example",
        "whatsapp": "3109998877",
    }
    assert hidden["contact"] is None
    assert hidden["display_name"] == "Finca Oculta Comercial"
    assert "3205556666" not in str(hidden)
    assert "oculta@finca.example" not in str(hidden)


def test_legacy_producer_without_account_has_no_contact_and_no_messaging(client):
    payload = client.get("/api/operational/producers").json()
    legacy = _producer_by_id(payload, LEGACY_PRODUCER)

    assert legacy["contact"] is None
    assert legacy["messaging_available"] is False
    assert legacy["display_name"] == "Histórico"


def test_messaging_available_for_linked_account(client):
    payload = client.get("/api/operational/producers").json()
    assert _producer_by_id(payload, VISIBLE_PRODUCER)["messaging_available"] is True


def test_visible_contact_with_no_public_fields_is_null(client):
    payload = client.get("/api/operational/producers").json()
    assert _producer_by_id(payload, PROFILE_ONLY_PRODUCER)["contact"] is None


def test_producer_detail_is_public_view_and_inactive_is_404(client):
    detail = client.get(f"/api/operational/producers/{VISIBLE_PRODUCER}")
    inactive = client.get(f"/api/operational/producers/{INACTIVE_PRODUCER}")

    assert detail.status_code == 200
    assert LEGACY_PHONE not in detail.text
    assert inactive.status_code == 404


def test_auth_email_is_never_used_as_commercial_contact(client):
    """El email de la cuenta de Auth no aparece aunque el productor no tenga email público."""
    with patch.object(
        auth_module,
        "verify_access_token",
        AsyncMock(return_value=AuthUser(id=PROFILE_ONLY_USER, email=AUTH_EMAIL)),
    ):
        payload = client.get("/api/operational/producers").text

    assert AUTH_EMAIL not in payload


# ========== CURRENT OFFERS ==========


def test_current_offers_drop_legacy_contact_fields(client):
    legacy_row = _offer_row(HIDDEN_PRODUCER, HIDDEN_USER, False)
    legacy_row["producer_phone"] = LEGACY_PHONE
    legacy_row["producer_email"] = LEGACY_EMAIL

    with patch.object(OperationalRepository, "get_current_operational_offers", AsyncMock(return_value=[legacy_row])):
        response = client.get("/api/operational/current-offer")

    assert response.status_code == 200
    assert LEGACY_PHONE not in response.text
    assert LEGACY_EMAIL not in response.text
    offer = response.json()["data"][0]
    assert "producer_phone" not in offer
    assert "producer_email" not in offer


def test_current_offer_contact_follows_contact_visible(client):
    payload = client.get("/api/operational/current-offer").json()

    visible = _offer_by_producer(payload, VISIBLE_PRODUCER)
    hidden = _offer_by_producer(payload, HIDDEN_PRODUCER)

    assert visible["producer_contact"] == {
        "public_phone": "3109998877",
        "public_email": "ventas@cafevisible.example",
        "whatsapp": "3109998877",
    }
    assert visible["messaging_available"] is True
    assert visible["producer_verified"] is True
    assert hidden["producer_contact"] is None
    assert hidden["messaging_available"] is True
    assert "3205556666" not in str(hidden)


def test_current_offer_without_linked_account_is_not_messageable(client):
    payload = client.get("/api/operational/current-offer").json()
    legacy = _offer_by_producer(payload, LEGACY_PRODUCER)

    assert legacy["messaging_available"] is False
    assert legacy["producer_contact"] is None
    assert LEGACY_PHONE not in str(legacy)


def test_current_offer_detail_hides_contact_and_404_when_not_current(client):
    visible_row = OFFERS[0]
    with patch.object(OperationalRepository, "get_row", AsyncMock(return_value=dict(visible_row))):
        found = client.get(f"/api/operational/current-offer/{visible_row['id']}")
    with patch.object(OperationalRepository, "get_row", AsyncMock(return_value=None)):
        missing = client.get(f"/api/operational/current-offer/{uuid4()}")

    assert found.status_code == 200
    assert found.json()["producer_contact"]["public_phone"] == "3109998877"
    assert LEGACY_PHONE not in found.text
    assert missing.status_code == 404
