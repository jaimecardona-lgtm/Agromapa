"""Imágenes ilustrativas por cultivo: ownership, estados, fallos, privacidad del prompt y reutilización.

Sin proveedor de IA real, sin Storage real y sin Supabase. Proveedor y storage son dobles.
Ninguna prueba realiza una llamada de pago.
"""

import re
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.auth import AuthUser
from app.routers import operational as operational_router
from app.schemas.operational import CurrentOfferResponse
from app.services import crop_image_service as svc
from app.services import operational_service
from app.services.image_providers import (
    DISABLED_MESSAGE,
    DisabledImageProvider,
    ImageProviderError,
    get_image_provider,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff" + b"\x00" * 64
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 64
OWNER = AuthUser(id=uuid4())
CROP_ID = uuid4()
FARM_ID = uuid4()
MUNICIPALITY_ID = str(uuid4())


class FakeProvider:
    name = "fake"

    def __init__(self, result=PNG, error=None):
        self.result = result
        self.error = error
        self.calls: list[str] = []

    async def generate(self, prompt: str) -> bytes:
        self.calls.append(prompt)
        if self.error:
            raise self.error
        return self.result


class FakeStorage:
    def __init__(self, error=None):
        self.error = error
        self.uploads: list[tuple[str, str]] = []

    def upload(self, path, data, mime):
        if self.error:
            raise svc.ImageStorageError("bucket unavailable")
        self.uploads.append((path, mime))
        return f"https://storage.example/crop-illustrations/{path}"


class FakeRepo:
    def __init__(self, status="none", url=None):
        self.crop = {
            "id": str(CROP_ID),
            "farm_id": str(FARM_ID),
            "crop_name": "Café",
            "illustrative_image_status": status,
            "illustrative_image_url": url,
        }
        self.updates: list[dict] = []
        self.claim_result = "claimable"

    async def get_row(self, table, row_id, columns="*"):
        if table == "farm_crops":
            return dict(self.crop)
        if table == "farms":
            return {"id": str(FARM_ID), "municipality_id": MUNICIPALITY_ID}
        if table == "geo_units":
            return {"id": MUNICIPALITY_ID, "name": "Yotoco", "dane_code": "76890"}
        return None

    async def claim_crop_illustration(self, farm_crop_id):
        if self.claim_result is None:
            return None
        self.crop["illustrative_image_status"] = "pending"
        return dict(self.crop)

    async def set_crop_illustration(self, farm_crop_id, fields):
        self.updates.append(fields)
        self.crop.update(fields)

    async def select_crop_image_rows(self, crop_ids):
        return [
            {"id": self.crop["id"], "illustrative_image_url": self.crop["illustrative_image_url"], "illustrative_image_status": self.crop["illustrative_image_status"]}
        ] if self.crop["id"] in crop_ids else []


class FakeGeo:
    async def get_by_dane_code(self, level, code):
        return {"name": "Valle del Cauca"} if level == "department" else None


@pytest.fixture
def owner_ok(monkeypatch):
    async def allow(farm_crop_id, user_id):
        return {"id": str(farm_crop_id)}

    monkeypatch.setattr(svc, "require_farm_crop_owner", allow)


@pytest.fixture
def repo(monkeypatch):
    fake = FakeRepo()
    monkeypatch.setattr(svc, "op_repo", fake)
    monkeypatch.setattr(svc, "geo_repo", FakeGeo())
    return fake


def _use(monkeypatch, provider):
    monkeypatch.setattr(svc, "get_image_provider", lambda: provider)


# ---------- ownership y estados ----------


async def test_owner_generates_ready_image_with_label(owner_ok, repo, monkeypatch):
    provider = FakeProvider()
    _use(monkeypatch, provider)
    storage = FakeStorage()

    result = await svc.generate_for_crop(CROP_ID, OWNER, storage=storage)

    assert result.status == "ready"
    assert result.image_url.startswith("https://storage.example/crop-illustrations/farm-crops/")
    assert result.label == "Imagen ilustrativa generada por IA"
    assert repo.crop["illustrative_image_status"] == "ready"
    assert len(provider.calls) == 1


async def test_non_owner_is_forbidden_and_nothing_is_generated(repo, monkeypatch):
    async def deny(farm_crop_id, user_id):
        raise HTTPException(status_code=403, detail="No tienes permiso para modificar esta finca")

    monkeypatch.setattr(svc, "require_farm_crop_owner", deny)
    provider = FakeProvider()
    _use(monkeypatch, provider)

    with pytest.raises(HTTPException) as exc:
        await svc.generate_for_crop(CROP_ID, AuthUser(id=uuid4()), storage=FakeStorage())

    assert exc.value.status_code == 403
    assert provider.calls == []
    assert repo.updates == []


async def test_missing_crop_is_404(repo, monkeypatch):
    async def missing(farm_crop_id, user_id):
        raise HTTPException(status_code=404, detail="Cultivo no encontrado")

    monkeypatch.setattr(svc, "require_farm_crop_owner", missing)

    with pytest.raises(HTTPException) as exc:
        await svc.generate_for_crop(CROP_ID, OWNER, storage=FakeStorage())

    assert exc.value.status_code == 404


async def test_ready_image_is_never_regenerated(owner_ok, monkeypatch):
    repo = FakeRepo(status="ready", url="https://storage.example/existing.webp")
    monkeypatch.setattr(svc, "op_repo", repo)
    monkeypatch.setattr(svc, "geo_repo", FakeGeo())
    provider = FakeProvider()
    _use(monkeypatch, provider)

    result = await svc.generate_for_crop(CROP_ID, OWNER, storage=FakeStorage())

    assert result.image_url == "https://storage.example/existing.webp"
    assert provider.calls == []
    assert repo.updates == []


async def test_pending_generation_is_not_started_twice(owner_ok, repo, monkeypatch):
    repo.claim_result = None
    provider = FakeProvider()
    _use(monkeypatch, provider)

    result = await svc.generate_for_crop(CROP_ID, OWNER, storage=FakeStorage())

    assert result.status == "pending"
    assert provider.calls == []


# ---------- fallos: el cultivo siempre se conserva ----------


async def test_provider_failure_marks_failed_and_keeps_the_crop(owner_ok, repo, monkeypatch):
    _use(monkeypatch, FakeProvider(error=ImageProviderError("timeout")))

    result = await svc.generate_for_crop(CROP_ID, OWNER, storage=FakeStorage())

    assert result.status == "failed"
    assert result.image_url is None
    assert repo.crop["illustrative_image_status"] == "failed"
    assert repo.crop["farm_id"] == str(FARM_ID)  # el cultivo no se toca


async def test_upload_failure_marks_failed(owner_ok, repo, monkeypatch):
    _use(monkeypatch, FakeProvider())

    result = await svc.generate_for_crop(CROP_ID, OWNER, storage=FakeStorage(error=True))

    assert result.status == "failed"
    assert repo.updates[-1] == {"illustrative_image_status": "failed"}


async def test_invalid_bytes_are_rejected_before_upload(owner_ok, repo, monkeypatch):
    _use(monkeypatch, FakeProvider(result=b"<html>no es una imagen</html>"))
    storage = FakeStorage()

    result = await svc.generate_for_crop(CROP_ID, OWNER, storage=storage)

    assert result.status == "failed"
    assert storage.uploads == []


async def test_disabled_provider_is_explicit_and_changes_nothing(owner_ok, repo, monkeypatch):
    _use(monkeypatch, DisabledImageProvider())

    with pytest.raises(svc.ImageGenerationDisabled):
        await svc.generate_for_crop(CROP_ID, OWNER, storage=FakeStorage())

    assert repo.updates == []
    assert repo.crop["illustrative_image_status"] == "none"


async def test_endpoint_maps_disabled_provider_to_503(monkeypatch):
    async def disabled(farm_crop_id, user):
        raise svc.ImageGenerationDisabled()

    monkeypatch.setattr(operational_router, "generate_for_crop", disabled)

    with pytest.raises(HTTPException) as exc:
        await operational_router.generate_crop_illustration(CROP_ID, user=OWNER)

    assert exc.value.status_code == 503
    assert exc.value.detail == DISABLED_MESSAGE


def test_default_provider_is_disabled_without_configuration(monkeypatch):
    monkeypatch.setattr(svc.settings, "IMAGE_GENERATION_PROVIDER", "")
    assert get_image_provider().name == "disabled"


def test_unknown_provider_name_falls_back_to_disabled(monkeypatch):
    monkeypatch.setattr(svc.settings, "IMAGE_GENERATION_PROVIDER", "proveedor-inventado")
    assert get_image_provider().name == "disabled"


# ---------- validación de bytes y rutas ----------


def test_accepts_png_jpeg_and_webp_only():
    assert svc.validate_image(PNG) == ("image/png", "png")
    assert svc.validate_image(JPEG) == ("image/jpeg", "jpg")
    assert svc.validate_image(WEBP) == ("image/webp", "webp")
    with pytest.raises(svc.ImageValidationError):
        svc.validate_image(b"GIF89a" + b"\x00" * 10)


def test_rejects_oversized_images():
    with pytest.raises(svc.ImageValidationError):
        svc.validate_image(PNG + b"\x00" * 100, max_bytes=50)


def test_object_path_is_generated_by_backend_from_uuid_only():
    path = svc.object_path(CROP_ID, "webp")
    assert path == f"farm-crops/{CROP_ID}/v1.webp"
    with pytest.raises(ValueError):
        svc.object_path("../../etc/passwd", "webp")


# ---------- prompt: sin datos personales ni coordenadas ----------


def test_prompt_contains_only_crop_and_territory():
    prompt = svc.build_prompt("Café", "Yotoco", "Valle del Cauca")

    assert "Café" in prompt
    assert "Yotoco, Valle del Cauca, Colombia" in prompt
    assert "Imagen ilustrativa" in prompt
    assert "Sin texto" in prompt


def test_prompt_sanitizes_crop_name_and_never_includes_contact_data():
    prompt = svc.build_prompt("Café <script>@jaime.privado</script> 3001112233", None, None)

    assert "@" not in prompt
    assert "<" not in prompt
    assert "3001112233" not in prompt
    assert "en zona rural de Colombia" in prompt


def test_prompt_has_no_coordinates():
    prompt = svc.build_prompt("Plátano", "Yotoco", "Valle del Cauca")
    assert not re.search(r"-?\d+\.\d{3,}", prompt)


# ---------- migración 014: aditiva, idempotente, no ejecutada ----------


def test_migration_014_is_additive_and_idempotent():
    path = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "014_crop_illustrative_images.sql"
    sql = path.read_text(encoding="utf-8").lower()

    assert "add column if not exists illustrative_image_url" in sql
    assert "add column if not exists illustrative_image_status" in sql
    assert "pg_constraint" in sql
    for destructive in ("drop ", "delete ", "truncate", "update public."):
        assert destructive not in sql


# ---------- reutilización: la oferta hereda la URL del cultivo ----------


async def test_offer_inherits_the_crop_illustration_url(monkeypatch):
    crop_url = "https://storage.example/crop-illustrations/farm-crops/x/v1.webp"
    repo = FakeRepo(status="ready", url=crop_url)
    offer_row = {
        "id": str(uuid4()),
        "farm_crop_id": str(CROP_ID),
        "farm_id": str(FARM_ID),
        "farm_name": "villa carolina",
        "producer_name": "Jaime",
        "producer_verified": False,
        "producer_user_id": None,
        "municipality_name": "Yotoco",
        "municipality_code": "76890",
        "crop_name": "Café",
        "quantity": 800,
        "unit": "kg",
        "available_from": None,
        "available_until": None,
        "price_per_unit": 8000,
        "expected_harvest_at": None,
        "harvested_at": None,
        "description": None,
        "notes": None,
        "status": "available",
        "created_at": "2026-10-24T00:00:00+00:00",
        "updated_at": "2026-10-24T00:00:00+00:00",
    }

    class OffersRepo:
        async def get_current_operational_offers(self, **kwargs):
            return [dict(offer_row)]

        async def select_crop_image_rows(self, crop_ids):
            return await repo.select_crop_image_rows(crop_ids)

    monkeypatch.setattr(operational_service, "op_repo", OffersRepo())
    result = await operational_service.get_current_offers()

    assert result.data[0].crop_image_url == crop_url
    assert result.count == 1


async def test_offers_still_work_when_image_lookup_fails(monkeypatch):
    class BrokenRepo:
        async def select_crop_image_rows(self, crop_ids):
            raise RuntimeError("column illustrative_image_url does not exist")

    monkeypatch.setattr(svc, "op_repo", BrokenRepo())

    assert await svc.crop_image_urls([str(CROP_ID)]) == {}


def test_public_offer_schema_declares_no_contact_or_account_fields():
    fields = set(CurrentOfferResponse.model_fields)
    assert "crop_image_url" in fields
    for forbidden in ("user_id", "email", "phone", "producer_user_id", "producer_email", "producer_phone"):
        assert forbidden not in fields
