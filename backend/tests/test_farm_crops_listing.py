"""Listado de cultivos por finca: dueño, aislamiento entre fincas y errores explícitos.

La base se simula con un cliente que filtra por farm_id como PostgREST y registra los filtros.
No hay red ni Supabase real.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core import auth as auth_module
from app.core.auth import AuthUser
from app.main import app
from app.repositories.identity_repository import identity_repository
from app.repositories.operational_repository import OperationalRepository
from app.schemas.operational import FarmCropCreate

OWNER_ID = uuid4()
OTHER_ID = uuid4()
PRODUCER_OWNER = uuid4()
PRODUCER_OTHER = uuid4()
FARM_A = uuid4()
FARM_B = uuid4()
TOKEN = "session-token-not-real"


def _crop(farm_id, name, area=1.0, description=None, harvest=None):
    return {
        "id": str(uuid4()),
        "farm_id": str(farm_id),
        "crop_name": name,
        "description": description,
        "area_hectares": area,
        "expected_harvest_at": harvest,
        "created_at": "2026-10-20T10:00:00+00:00",
        "updated_at": "2026-10-20T10:00:00+00:00",
    }


CROPS = [
    _crop(FARM_A, "caña", 1.0),
    _crop(FARM_A, "Plátano", 2.0, description="Lote norte", harvest="2027-03-01"),
    _crop(FARM_B, "Cacao", 3.0),
]

FARMS = {str(FARM_A): {"id": str(FARM_A), "producer_id": str(PRODUCER_OWNER)},
         str(FARM_B): {"id": str(FARM_B), "producer_id": str(PRODUCER_OTHER)}}
PRODUCERS = {str(PRODUCER_OWNER): {"id": str(PRODUCER_OWNER), "user_id": str(OWNER_ID)},
             str(PRODUCER_OTHER): {"id": str(PRODUCER_OTHER), "user_id": str(OTHER_ID)}}


class FakeQuery:
    def __init__(self, rows, log):
        self._rows = rows
        self._log = log

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self._log.append(("eq", column))
        self._rows = [row for row in self._rows if str(row.get(column)) == str(value)]
        return self

    def order(self, column):
        self._log.append(("order", column))
        return self

    def execute(self):
        return type("Response", (), {"data": self._rows})()


class FakeClient:
    def __init__(self):
        self.calls = []

    def table(self, name):
        assert name == "farm_crops", name
        return FakeQuery(list(CROPS), self.calls)


async def _get_row(_self, table, row_id, _columns):
    store = {"farms": FARMS, "producers": PRODUCERS}[table]
    return store.get(str(row_id))


@pytest.fixture
def fake_db():
    client = FakeClient()
    with (
        patch.object(OperationalRepository, "_get_client", lambda _self: client),
        patch.object(OperationalRepository, "get_row", _get_row),
        patch.object(identity_repository, "list_role_names", AsyncMock(return_value=["producer"])),
        patch.object(identity_repository, "get_producer_by_user", AsyncMock(return_value={"id": str(PRODUCER_OWNER), "active": True})),
    ):
        yield client


def _as(user_id):
    return patch.object(
        auth_module, "verify_access_token", AsyncMock(return_value=AuthUser(id=user_id, email="ana@example.com"))
    )


def _list(client, farm_id, token=TOKEN):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.get(f"/api/operational/farms/{farm_id}/crops", headers=headers)


def test_owner_gets_all_crops_of_the_farm(fake_db):
    with _as(OWNER_ID):
        response = _list(TestClient(app), FARM_A)

    assert response.status_code == 200
    names = sorted(row["crop_name"] for row in response.json())
    assert names == ["Plátano", "caña"]


def test_list_never_mixes_crops_from_another_farm(fake_db):
    with _as(OWNER_ID):
        response = _list(TestClient(app), FARM_A)

    assert all(row["farm_id"] == str(FARM_A) for row in response.json())
    assert "Cacao" not in [row["crop_name"] for row in response.json()]


def test_list_does_not_filter_by_nonexistent_active_column(fake_db):
    with _as(OWNER_ID):
        _list(TestClient(app), FARM_A)

    columns = [column for _, column in fake_db.calls]
    assert "active" not in columns
    assert "farm_id" in columns


def test_null_description_and_harvest_date_render_as_null(fake_db):
    with _as(OWNER_ID):
        rows = _list(TestClient(app), FARM_A).json()

    caña = next(row for row in rows if row["crop_name"] == "caña")
    assert caña["description"] is None
    assert caña["expected_harvest_at"] is None
    assert caña["area_hectares"] == 1.0


def test_another_producers_farm_is_403(fake_db):
    with _as(OTHER_ID):
        response = _list(TestClient(app), FARM_A)
    assert response.status_code == 403


def test_anonymous_request_is_401(fake_db):
    response = _list(TestClient(app), FARM_A, token=None)
    assert response.status_code == 401


def test_user_without_producer_role_is_403(fake_db):
    with (
        _as(OWNER_ID),
        patch.object(identity_repository, "list_role_names", AsyncMock(return_value=["buyer"])),
    ):
        response = _list(TestClient(app), FARM_A)
    assert response.status_code == 403


def test_unknown_farm_is_404(fake_db):
    with _as(OWNER_ID):
        response = _list(TestClient(app), uuid4())
    assert response.status_code == 404


def test_database_failure_is_503_not_an_empty_list(fake_db):
    def broken_table(_name):
        raise RuntimeError("column farm_crops.active does not exist")

    fake_db.table = broken_table
    with _as(OWNER_ID):
        response = _list(TestClient(app), FARM_A)

    assert response.status_code == 503
    assert response.json()["detail"] == "No pudimos cargar los cultivos en este momento."


def test_crop_name_is_trimmed_and_blank_name_is_rejected():
    assert FarmCropCreate(crop_name="  Café  ").crop_name == "Café"
    with pytest.raises(ValidationError):
        FarmCropCreate(crop_name="   ")
