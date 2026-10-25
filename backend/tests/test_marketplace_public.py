"""Marketplace público: perfil de productor, fincas del mapa y ofertas vigentes, sin privados.

Repositorios reemplazados por dobles en memoria: no hay Supabase real ni red.
La fila de finca de prueba incluye columnas legacy de contacto para demostrar que no salen.
"""

import json
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.marketplace import PublicProducerProfile
from app.services import marketplace_service as svc

PRODUCER_ID = UUID("ecc689f2-777d-4844-9a91-229af7fbedf3")
OTHER_PRODUCER_ID = UUID("11111111-2222-4333-8444-555555555555")
USER_ID = "732b89e0-4d24-4148-af5e-df2614a4e197"
OTHER_USER_ID = "99999999-8888-4777-8666-555555555555"
VILLA_ID = UUID("b058a6e5-687f-4449-b2bd-e1f3c1893159")
OTHER_FARM_ID = UUID("22222222-3333-4444-8555-666666666666")
MUNICIPALITY_ID = "m-yotoco"
SECRET_CONTACT = "contacto-secreto-no-publicar"
SECRET_EMAIL = "jaime-privado@example.com"
SECRET_PHONE = "3001112233"

PRODUCERS = [
    {"id": str(PRODUCER_ID), "name": "Jaime Cardona", "user_id": USER_ID, "active": True},
    {"id": str(OTHER_PRODUCER_ID), "name": "Productor inactivo", "user_id": OTHER_USER_ID, "active": False},
]
PROFILES = {
    USER_ID: {
        "user_id": USER_ID,
        "business_name": "Jaime Cardona Finca",
        "description": "Café y frutales de Yotoco",
        "verified": True,
        # Contacto privado: existe en la fila, pero el DTO público no lo declara.
        "public_phone": SECRET_PHONE,
        "public_email": SECRET_EMAIL,
        "whatsapp": SECRET_PHONE,
        "contact_visible": False,
    },
}
FARMS = [
    {
        "id": str(VILLA_ID),
        "name": "villa carolina",
        "description": None,
        "area_ha": 4.5,
        "latitude": 3.8742,
        "longitude": -76.4072,
        "municipality_id": MUNICIPALITY_ID,
        "producer_id": str(PRODUCER_ID),
        "active": True,
        # Columnas legacy que el endpoint anterior devolvía con select(*).
        "producer_contact": SECRET_CONTACT,
        "producer_name": "legacy",
    },
    {
        "id": str(OTHER_FARM_ID),
        "name": "finca de productor inactivo",
        "description": None,
        "area_ha": 1,
        "latitude": 3.9,
        "longitude": -76.4,
        "municipality_id": MUNICIPALITY_ID,
        "producer_id": str(OTHER_PRODUCER_ID),
        "active": True,
    },
]
CROP_CAFE_ID = "55555555-6666-4777-8888-999999999999"
CROP_PLATANO_ID = "66666666-7777-4888-8999-000000000000"
CROPS = [
    {"id": CROP_CAFE_ID, "farm_id": str(VILLA_ID), "crop_name": " Café ", "area_hectares": 1},
    {"id": CROP_PLATANO_ID, "farm_id": str(VILLA_ID), "crop_name": "Plátano", "area_hectares": 2},
]
CROP_IMAGES = {CROP_CAFE_ID: {"id": CROP_CAFE_ID, "illustrative_image_url": "https://cdn.example/cafe.webp", "illustrative_image_status": "ready"}}
GEO_UNITS = [{"id": MUNICIPALITY_ID, "name": "Yotoco", "dane_code": "76890"}]
OFFERS = [
    {
        "id": "33333333-4444-4555-8666-777777777777",
        "crop_name": "Café",
        "farm_id": str(VILLA_ID),
        "farm_name": "villa carolina",
        "municipality_code": "76890",
        "municipality_name": "Yotoco",
        "quantity": 800,
        "unit": "kg",
        "price_per_unit": 8000,
        "available_from": "2026-10-24",
        "available_until": "2026-10-28",
        "status": "available",
        "description": "cafe con alta calidad",
        "producer_id": str(PRODUCER_ID),
    },
    {
        "id": "44444444-5555-4666-8777-888888888888",
        "crop_name": "Yuca",
        "farm_id": str(OTHER_FARM_ID),
        "farm_name": "finca de productor inactivo",
        "quantity": 10,
        "unit": "kg",
        "status": "available",
        "producer_id": str(OTHER_PRODUCER_ID),
    },
]


class FakeOperationalRepo:
    def __init__(self, offers=OFFERS):
        self.offers = offers
        self.farm_queries = []

    async def get_row(self, table, row_id, columns="*"):
        if table == "producers":
            return next((p for p in PRODUCERS if p["id"] == str(row_id)), None)
        return None

    async def select_in(self, table, column, values, columns="*"):
        if table == "producers":
            return [p for p in PRODUCERS if p["id"] in values]
        if table == "geo_units":
            return [g for g in GEO_UNITS if g["id"] in values]
        if table == "farm_crops":
            return [c for c in CROPS if c["farm_id"] in values]
        raise AssertionError(f"tabla inesperada: {table}")

    async def select_crop_image_rows(self, crop_ids):
        return [CROP_IMAGES[cid] for cid in crop_ids if cid in CROP_IMAGES]

    async def list_public_farms(self, municipality_id=None, producer_id=None):
        self.farm_queries.append({"municipality_id": municipality_id, "producer_id": producer_id})
        rows = [f for f in FARMS if f["active"]]
        if municipality_id:
            rows = [f for f in rows if f["municipality_id"] == municipality_id]
        if producer_id:
            rows = [f for f in rows if f["producer_id"] == str(producer_id)]
        return rows

    async def list_active_offers_by_producer(self, producer_id):
        return [o for o in self.offers if o["producer_id"] == str(producer_id)]


class FakeGeo:
    async def get_by_dane_code(self, level, dane_code):
        if level == "municipality" and dane_code == "76890":
            return {"id": MUNICIPALITY_ID, "name": "Yotoco", "dane_code": "76890"}
        if level == "department" and dane_code == "76":
            return {"dane_code": "76", "name": "Valle del Cauca"}
        return None


class FakeIdentity:
    async def get_producer_profiles_by_users(self, user_ids):
        return {uid: PROFILES[uid] for uid in user_ids if uid in PROFILES}


@pytest.fixture
def repos(monkeypatch):
    operational = FakeOperationalRepo()
    monkeypatch.setattr(svc, "op_repo", operational)
    monkeypatch.setattr(svc, "geo_repo", FakeGeo())
    monkeypatch.setattr(svc, "identity_repository", FakeIdentity())
    return operational


@pytest.fixture
def client():
    return TestClient(app)


def _json_text(payload) -> str:
    return json.dumps(payload, ensure_ascii=False)


# ---------- perfil público de productor ----------


async def test_existing_producer_profile_has_name_territory_farms_crops_and_offer(repos):
    profile = await svc.get_public_producer_profile(PRODUCER_ID)

    assert isinstance(profile, PublicProducerProfile)
    assert profile.name == "Jaime Cardona Finca"
    assert profile.verified is True
    assert profile.municipality.name == "Yotoco"
    assert profile.department.code == "76"
    assert profile.department.name == "Valle del Cauca"
    assert [farm.name for farm in profile.farms] == ["villa carolina"]
    assert [crop.name for crop in profile.farms[0].crops] == ["Café", "Plátano"]
    assert [offer.crop_name for offer in profile.active_offers] == ["Café"]


async def test_unknown_or_inactive_producer_is_none_and_404_over_http(repos, client):
    assert await svc.get_public_producer_profile(UUID("00000000-0000-4000-8000-000000000000")) is None
    assert await svc.get_public_producer_profile(OTHER_PRODUCER_ID) is None

    response = client.get(f"/api/marketplace/producers/{OTHER_PRODUCER_ID}")
    assert response.status_code == 404


async def test_producer_without_offers_gets_an_empty_list_not_an_error(repos):
    repos.offers = []

    profile = await svc.get_public_producer_profile(PRODUCER_ID)

    assert profile.active_offers == []
    assert len(profile.farms) == 1


async def test_offers_belong_to_the_requested_producer_only(repos):
    profile = await svc.get_public_producer_profile(PRODUCER_ID)

    own_farm_ids = {farm.id for farm in profile.farms}
    assert all(offer.farm_id in own_farm_ids for offer in profile.active_offers)
    assert "Yuca" not in [offer.crop_name for offer in profile.active_offers]


async def test_producer_filter_is_applied_to_farms_and_offers(repos):
    await svc.get_public_producer_profile(PRODUCER_ID)

    assert {"municipality_id": None, "producer_id": PRODUCER_ID} in repos.farm_queries


# ---------- privados nunca publicados ----------


async def test_profile_never_exposes_contact_email_phone_or_user_id(repos, client):
    response = client.get(f"/api/marketplace/producers/{PRODUCER_ID}")

    assert response.status_code == 200
    text = response.text
    for forbidden in (SECRET_EMAIL, SECRET_PHONE, SECRET_CONTACT, USER_ID):
        assert forbidden not in text
    for key in ("user_id", "email", "phone", "whatsapp", "public_email", "public_phone", "producer_contact"):
        assert f'"{key}"' not in text


def test_municipality_farms_map_endpoint_hides_legacy_contact_columns(repos, client):
    response = client.get("/api/farms/municipalities/76890")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    farm = body["data"][0]
    assert farm["name"] == "villa carolina"
    assert farm["producer_name"] == "Jaime Cardona Finca"
    assert farm["crops"] == [
        {"name": "Café", "area_hectares": 1.0, "image_url": "https://cdn.example/cafe.webp"},
        {"name": "Plátano", "area_hectares": 2.0, "image_url": None},
    ]
    text = _json_text(body)
    for forbidden in (SECRET_CONTACT, SECRET_EMAIL, SECRET_PHONE, USER_ID, "legacy"):
        assert forbidden not in text


def test_public_farm_only_declares_public_fields(repos, client):
    body = client.get("/api/farms/municipalities/76890").json()
    assert set(body["data"][0]) == {
        "id",
        "name",
        "description",
        "area_ha",
        "latitude",
        "longitude",
        "municipality_code",
        "municipality_name",
        "producer_id",
        "producer_name",
        "producer_verified",
        "crops",
    }


# ---------- separación operacional / EVA ----------


async def test_public_profile_contains_no_eva_statistics(repos):
    profile = await svc.get_public_producer_profile(PRODUCER_ID)
    text = _json_text(profile.model_dump(mode="json"))

    for eva_field in ("total_production_tons", "total_area_planted_ha", "eva", "agriculture", "year"):
        assert eva_field not in text


async def test_farm_and_crop_names_are_trimmed(repos):
    farms = await svc.get_public_farms_for_municipality("76890")
    assert farms[0].crops[0].name == "Café"
