"""Contrato de ofertas productivas: validación de fechas, ownership y listado propio.

Sin Supabase real: el repositorio se reemplaza por dobles en memoria.
"""

from datetime import date
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.auth import AuthUser
from app.schemas.operational import MyProductionOfferResponse, ProductionOfferCreate
from app.services import operational_service as svc

BASE = {"available_quantity": 10, "unit": "kg"}


class TestOfferDateValidation:
    def test_end_before_start_is_rejected(self):
        with pytest.raises(ValidationError):
            ProductionOfferCreate(**BASE, availability_start=date(2026, 11, 10), availability_end=date(2026, 11, 1))

    def test_same_day_window_is_accepted(self):
        offer = ProductionOfferCreate(**BASE, availability_start=date(2026, 11, 1), availability_end=date(2026, 11, 1))
        assert offer.availability_end == offer.availability_start

    def test_open_ended_window_is_accepted(self):
        ProductionOfferCreate(**BASE, availability_start=date(2026, 11, 1))
        ProductionOfferCreate(**BASE, availability_end=date(2026, 11, 1))

    def test_non_positive_quantity_is_rejected(self):
        with pytest.raises(ValidationError):
            ProductionOfferCreate(available_quantity=0, unit="kg")

    def test_negative_price_is_rejected(self):
        with pytest.raises(ValidationError):
            ProductionOfferCreate(**BASE, price_per_unit=-1)


class _RecordingRepo:
    """Doble del repositorio: registra si se intentó crear algo."""

    def __init__(self):
        self.created = []

    async def create_production_offer(self, **kwargs):
        self.created.append(kwargs)
        return {
            "id": str(uuid4()),
            "farm_crop_id": str(kwargs["farm_crop_id"]),
            "available_quantity": kwargs["available_quantity"],
            "unit": kwargs["unit"],
            "status": "available",
            "created_at": "2026-10-24T00:00:00+00:00",
            "updated_at": "2026-10-24T00:00:00+00:00",
        }


@pytest.fixture
def repo(monkeypatch):
    fake = _RecordingRepo()
    monkeypatch.setattr(svc, "op_repo", fake)
    return fake


class TestCreateOfferOwnership:
    async def test_foreign_or_missing_crop_never_reaches_repository(self, monkeypatch, repo):
        async def deny(farm_crop_id, user_id):
            raise HTTPException(status_code=403, detail="No tienes permiso para modificar esta finca")

        monkeypatch.setattr(svc, "require_farm_crop_owner", deny)
        user = AuthUser(id=uuid4())

        with pytest.raises(HTTPException) as exc:
            await svc.create_production_offer(uuid4(), ProductionOfferCreate(**BASE), user)

        assert exc.value.status_code == 403
        assert repo.created == []

    async def test_missing_crop_answers_404_without_writing(self, monkeypatch, repo):
        async def missing(farm_crop_id, user_id):
            raise HTTPException(status_code=404, detail="Cultivo no encontrado")

        monkeypatch.setattr(svc, "require_farm_crop_owner", missing)

        with pytest.raises(HTTPException) as exc:
            await svc.create_production_offer(uuid4(), ProductionOfferCreate(**BASE), AuthUser(id=uuid4()))

        assert exc.value.status_code == 404
        assert repo.created == []

    async def test_owner_creates_offer_for_the_route_crop(self, monkeypatch, repo):
        async def allow(farm_crop_id, user_id):
            return {"id": farm_crop_id}

        monkeypatch.setattr(svc, "require_farm_crop_owner", allow)
        crop_id = uuid4()

        result = await svc.create_production_offer(crop_id, ProductionOfferCreate(**BASE), AuthUser(id=uuid4()))

        assert result.farm_crop_id == crop_id
        assert repo.created[0]["farm_crop_id"] == crop_id


class _SelectInRepo:
    def __init__(self, crops, offers):
        self.crops = crops
        self.offers = offers

    async def select_in(self, table, column, values, columns="*"):
        if table == "farm_crops":
            return [row for row in self.crops if str(row["farm_id"]) in values]
        if table == "production_offers":
            return [row for row in self.offers if str(row["farm_crop_id"]) in values]
        raise AssertionError(f"tabla inesperada: {table}")


class TestMyOffers:
    async def test_lists_only_offers_of_own_farms_with_crop_and_farm_context(self, monkeypatch):
        own_farm, other_farm = uuid4(), uuid4()
        own_crop, foreign_crop = uuid4(), uuid4()
        offer_id = uuid4()

        class _Farm:
            def __init__(self, id_, name):
                self.id = id_
                self.name = name

        async def my_farms(user):
            return [_Farm(own_farm, "villa carolina")]

        monkeypatch.setattr(svc, "list_my_farms", my_farms)
        monkeypatch.setattr(
            svc,
            "op_repo",
            _SelectInRepo(
                crops=[
                    {"id": own_crop, "farm_id": own_farm, "crop_name": "Plátano"},
                    {"id": foreign_crop, "farm_id": other_farm, "crop_name": "Yuca"},
                ],
                offers=[
                    {
                        "id": offer_id,
                        "farm_crop_id": own_crop,
                        "available_quantity": 5,
                        "unit": "kg",
                        "status": "available",
                        "created_at": "2026-10-24T00:00:00+00:00",
                        "updated_at": "2026-10-24T00:00:00+00:00",
                    },
                    {
                        "id": uuid4(),
                        "farm_crop_id": foreign_crop,
                        "available_quantity": 9,
                        "unit": "kg",
                        "status": "available",
                        "created_at": "2026-10-24T00:00:00+00:00",
                        "updated_at": "2026-10-24T00:00:00+00:00",
                    },
                ],
            ),
        )

        offers = await svc.list_my_offers(AuthUser(id=uuid4()))

        assert len(offers) == 1
        assert isinstance(offers[0], MyProductionOfferResponse)
        assert offers[0].id == offer_id
        assert offers[0].crop_name == "Plátano"
        assert offers[0].farm_name == "villa carolina"
        assert offers[0].farm_id == own_farm

    async def test_no_farms_means_no_offers_and_no_query(self, monkeypatch):
        async def no_farms(user):
            return []

        monkeypatch.setattr(svc, "list_my_farms", no_farms)
        monkeypatch.setattr(svc, "op_repo", _SelectInRepo(crops=[], offers=[]))

        assert await svc.list_my_offers(AuthUser(id=uuid4())) == []
