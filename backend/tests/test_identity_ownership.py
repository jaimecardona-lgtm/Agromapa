"""Ownership tests for the operational model.

Chain: user -> producer (producers.user_id) -> farm -> farm_crop -> offer.
Supabase is replaced by an in-memory store. No real Auth and no real database.
"""

import copy
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import AuthUser
from app.main import app
from app.repositories.identity_repository import identity_repository
from app.repositories.operational_repository import OperationalRepository

OWNER_USER = uuid4()
INTRUDER_USER = uuid4()
OWNER_PRODUCER = uuid4()
ORPHAN_PRODUCER = uuid4()  # registro histórico sin user_id
FARM_ID = uuid4()
CROP_ID = uuid4()
OFFER_ID = uuid4()
TS = "2026-10-12T10:00:00+00:00"

STORE: dict[str, dict[str, dict]] = {}


def _seed_store():
    STORE.clear()
    STORE["producers"] = {
        str(OWNER_PRODUCER): {
            "id": str(OWNER_PRODUCER),
            "name": "Finca Ana",
            "user_id": str(OWNER_USER),
            "active": True,
            "created_at": TS,
            "updated_at": TS,
        },
        str(ORPHAN_PRODUCER): {
            "id": str(ORPHAN_PRODUCER),
            "name": "Histórico",
            "user_id": None,
            "active": True,
            "created_at": TS,
            "updated_at": TS,
        },
    }
    STORE["farms"] = {
        str(FARM_ID): {
            "id": str(FARM_ID),
            "producer_id": str(OWNER_PRODUCER),
            "name": "La Esperanza",
            "latitude": 4.5,
            "longitude": -75.6,
            "active": True,
            "created_at": TS,
            "updated_at": TS,
        },
    }
    STORE["farm_crops"] = {
        str(CROP_ID): {"id": str(CROP_ID), "farm_id": str(FARM_ID), "crop_name": "Café", "created_at": TS, "updated_at": TS},
    }
    STORE["production_offers"] = {
        str(OFFER_ID): {
            "id": str(OFFER_ID),
            "farm_crop_id": str(CROP_ID),
            "available_quantity": 10,
            "unit": "kg",
            "status": "available",
            "created_at": TS,
            "updated_at": TS,
        },
    }


async def fake_get_row(self, table, row_id, columns="*"):
    row = STORE.get(table, {}).get(str(row_id))
    return copy.deepcopy(row) if row else None


async def fake_select_in(self, table, column, values, columns="*"):
    return [copy.deepcopy(r) for r in STORE.get(table, {}).values() if str(r.get(column)) in values]


async def fake_update_farm(self, farm_id, update_data):
    STORE["farms"][str(farm_id)].update(update_data)
    return copy.deepcopy(STORE["farms"][str(farm_id)])


async def fake_update_farm_crop(self, farm_crop_id, update_data):
    STORE["farm_crops"][str(farm_crop_id)].update(update_data)
    return copy.deepcopy(STORE["farm_crops"][str(farm_crop_id)])


async def fake_update_production_offer(self, offer_id, update_data):
    STORE["production_offers"][str(offer_id)].update(update_data)
    return copy.deepcopy(STORE["production_offers"][str(offer_id)])


async def fake_get_farm_by_id(self, farm_id):
    row = STORE["farms"].get(str(farm_id))
    return copy.deepcopy(row) if row else None


async def fake_get_farm_crop_by_id(self, farm_crop_id):
    row = STORE["farm_crops"].get(str(farm_crop_id))
    return copy.deepcopy(row) if row else None


async def fake_get_production_offer_by_id(self, offer_id):
    row = STORE["production_offers"].get(str(offer_id))
    return copy.deepcopy(row) if row else None


def _auth_as(user_id):
    """Patches token validation so the token resolves to `user_id`."""
    return patch.object(
        auth_module,
        "verify_access_token",
        AsyncMock(return_value=AuthUser(id=user_id, email="x@example.com")),
    )


def _roles(*roles):
    return patch.object(identity_repository, "list_role_names", AsyncMock(return_value=list(roles)))


def _active_producer_for(producer_id):
    return patch.object(
        identity_repository,
        "get_producer_by_user",
        AsyncMock(return_value={"id": str(producer_id), "active": True, "user_id": None}),
    )


@pytest.fixture(autouse=True)
def _store():
    _seed_store()
    with (
        patch.object(OperationalRepository, "get_row", fake_get_row),
        patch.object(OperationalRepository, "select_in", fake_select_in),
        patch.object(OperationalRepository, "get_farm_by_id", fake_get_farm_by_id),
        patch.object(OperationalRepository, "get_farm_crop_by_id", fake_get_farm_crop_by_id),
        patch.object(OperationalRepository, "get_production_offer_by_id", fake_get_production_offer_by_id),
        patch.object(OperationalRepository, "update_farm", fake_update_farm),
        patch.object(OperationalRepository, "update_farm_crop", fake_update_farm_crop),
        patch.object(OperationalRepository, "update_production_offer", fake_update_production_offer),
    ):
        yield


@pytest.fixture
def client():
    return TestClient(app)


AUTH = {"Authorization": "Bearer test-token"}


# ========== ANONYMOUS / PUBLIC ==========


def test_anonymous_cannot_create_farm(client):
    response = client.post(
        "/api/operational/farms",
        json={"name": "Nueva", "municipality_code": "76001", "latitude": 3.4, "longitude": -76.5},
    )
    assert response.status_code == 401


def test_anonymous_cannot_patch_farm(client):
    response = client.patch(f"/api/operational/farms/{FARM_ID}", json={"name": "Hack"})
    assert response.status_code == 401
    assert STORE["farms"][str(FARM_ID)]["name"] == "La Esperanza"


def test_public_farm_read_needs_no_auth(client):
    response = client.get(f"/api/operational/farms/{FARM_ID}")
    assert response.status_code == 200
    assert response.json()["name"] == "La Esperanza"


def test_public_crop_and_offer_reads_need_no_auth(client):
    assert client.get(f"/api/operational/farm-crops/{CROP_ID}").status_code == 200
    assert client.get(f"/api/operational/offers/{OFFER_ID}").status_code == 200


# ========== ROLE ==========


def test_buyer_cannot_create_farm(client):
    with _auth_as(OWNER_USER), _roles("buyer"):
        response = client.post(
            "/api/operational/farms",
            headers=AUTH,
            json={"name": "Nueva", "municipality_code": "76001", "latitude": 3.4, "longitude": -76.5},
        )
    assert response.status_code == 403


# ========== CREATE FARM: PRODUCER COMES FROM THE TOKEN ==========


def test_create_farm_as_producer_uses_producer_from_token(client):
    create = AsyncMock(
        return_value={
            "id": str(uuid4()),
            "producer_id": str(OWNER_PRODUCER),
            "name": "Nueva",
            "latitude": 3.4,
            "longitude": -76.5,
            "active": True,
            "created_at": TS,
            "updated_at": TS,
        }
    )
    with (
        _auth_as(OWNER_USER),
        _roles("producer"),
        _active_producer_for(OWNER_PRODUCER),
        patch.object(OperationalRepository, "create_farm", create),
    ):
        response = client.post(
            "/api/operational/farms",
            headers=AUTH,
            json={"name": "Nueva", "municipality_code": "76001", "latitude": 3.4, "longitude": -76.5},
        )
    assert response.status_code == 201
    assert create.await_args.kwargs["producer_id"] == OWNER_PRODUCER


def test_create_farm_rejects_producer_id_in_body(client):
    """Mass assignment: producer_id no se acepta en el body."""
    with _auth_as(OWNER_USER), _roles("producer"), _active_producer_for(OWNER_PRODUCER):
        response = client.post(
            "/api/operational/farms",
            headers=AUTH,
            json={
                "producer_id": str(ORPHAN_PRODUCER),
                "name": "Robada",
                "municipality_code": "76001",
                "latitude": 3.4,
                "longitude": -76.5,
            },
        )
    assert response.status_code == 422


def test_create_farm_without_active_producer_is_403(client):
    with _auth_as(OWNER_USER), _roles("producer"), patch.object(
        identity_repository, "get_producer_by_user", AsyncMock(return_value=None)
    ):
        response = client.post(
            "/api/operational/farms",
            headers=AUTH,
            json={"name": "Nueva", "municipality_code": "76001", "latitude": 3.4, "longitude": -76.5},
        )
    assert response.status_code == 403


# ========== OWNERSHIP ==========


def test_owner_can_patch_own_farm(client):
    with _auth_as(OWNER_USER), _roles("producer"):
        response = client.patch(f"/api/operational/farms/{FARM_ID}", headers=AUTH, json={"name": "Renombrada"})
    assert response.status_code == 200
    assert STORE["farms"][str(FARM_ID)]["name"] == "Renombrada"


def test_producer_cannot_patch_farm_known_only_by_uuid(client):
    """Otro productor conoce el UUID de la finca: 403 y sin cambios."""
    with _auth_as(INTRUDER_USER), _roles("producer"):
        response = client.patch(f"/api/operational/farms/{FARM_ID}", headers=AUTH, json={"name": "Ajena"})
    assert response.status_code == 403
    assert STORE["farms"][str(FARM_ID)]["name"] == "La Esperanza"


def test_patch_farm_owned_by_orphan_producer_is_403(client):
    """Registro histórico sin user_id nunca se autoriza por nombre ni por otro campo."""
    STORE["farms"][str(FARM_ID)]["producer_id"] = str(ORPHAN_PRODUCER)
    with _auth_as(OWNER_USER), _roles("producer"):
        response = client.patch(f"/api/operational/farms/{FARM_ID}", headers=AUTH, json={"name": "X"})
    assert response.status_code == 403


def test_patch_unknown_farm_is_404(client):
    with _auth_as(OWNER_USER), _roles("producer"):
        response = client.patch(f"/api/operational/farms/{uuid4()}", headers=AUTH, json={"name": "X"})
    assert response.status_code == 404


def test_foreign_user_cannot_update_crop(client):
    with _auth_as(INTRUDER_USER), _roles("producer"):
        response = client.patch(
            f"/api/operational/farm-crops/{CROP_ID}", headers=AUTH, json={"crop_name": "Cacao"}
        )
    assert response.status_code == 403
    assert STORE["farm_crops"][str(CROP_ID)]["crop_name"] == "Café"


def test_foreign_user_cannot_update_offer(client):
    with _auth_as(INTRUDER_USER), _roles("producer"):
        response = client.patch(
            f"/api/operational/offers/{OFFER_ID}", headers=AUTH, json={"status": "sold_out"}
        )
    assert response.status_code == 403
    assert STORE["production_offers"][str(OFFER_ID)]["status"] == "available"


def test_owner_can_update_offer_status(client):
    with _auth_as(OWNER_USER), _roles("producer"):
        response = client.patch(
            f"/api/operational/offers/{OFFER_ID}", headers=AUTH, json={"status": "sold_out"}
        )
    assert response.status_code == 200
    assert STORE["production_offers"][str(OFFER_ID)]["status"] == "sold_out"


def test_offer_status_outside_allowed_values_is_422(client):
    with _auth_as(OWNER_USER), _roles("producer"):
        response = client.patch(
            f"/api/operational/offers/{OFFER_ID}", headers=AUTH, json={"status": "publicado"}
        )
    assert response.status_code == 422


def test_owner_can_patch_own_crop(client):
    with _auth_as(OWNER_USER), _roles("producer"):
        response = client.patch(
            f"/api/operational/farm-crops/{CROP_ID}", headers=AUTH, json={"crop_name": "Cacao"}
        )
    assert response.status_code == 200
