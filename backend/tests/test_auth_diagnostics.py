"""Diagnóstico de auth: causas explícitas de 503, 401 vs 503, logs sin secretos y bootstrap.

Supabase Auth y el repositorio se simulan. No se usa red ni credenciales reales.
"""

import logging
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import AuthInvalidToken, AuthServiceUnavailable, AuthUser
from app.core.config import settings
from app.main import app
from app.repositories.identity_repository import identity_repository
from app.services import identity_service

USER_ID = uuid4()
SECRET_ANON = "anon-sentinel-DO-NOT-LOG-123"
SECRET_SERVICE = "service-sentinel-DO-NOT-LOG-456"
TOKEN = "session-sentinel-DO-NOT-LOG-789"
REAL_ASYNC_CLIENT = httpx.AsyncClient


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", SECRET_ANON)
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", SECRET_SERVICE)


@contextmanager
def _supabase(handler):
    """Cliente httpx compartido de auth con respuestas simuladas (sin red); se restaura al salir."""
    client = REAL_ASYNC_CLIENT(transport=httpx.MockTransport(handler))
    previous = auth_module._auth_client
    auth_module._auth_client = client
    try:
        yield client
    finally:
        auth_module._auth_client = previous


def _user_json():
    return {"id": str(USER_ID), "email": "ana@example.com", "user_metadata": {"display_name": "Ana"}}


# ---------- configuración ----------


async def test_missing_configuration_names_the_variables_but_not_their_values(monkeypatch, caplog):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", SECRET_ANON)
    caplog.set_level(logging.ERROR)

    with pytest.raises(AuthServiceUnavailable) as info:
        await auth_module.verify_access_token(TOKEN)

    assert info.value.reason == "config_missing"
    assert "SUPABASE_URL" in caplog.text
    assert SECRET_ANON not in caplog.text
    assert TOKEN not in caplog.text


def test_missing_auth_settings_lists_only_absent_names(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "")
    assert auth_module.missing_auth_settings() == ["SUPABASE_URL", "SUPABASE_ANON_KEY"]


def test_service_secret_is_not_required_for_token_validation(configured, monkeypatch):
    # La validación de tokens usa la clave anon; la clave de servicio no debe bloquearla.
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "")
    assert auth_module.missing_auth_settings() == []


# ---------- validación del token (Supabase simulado) ----------


async def test_valid_token_resolves_user_and_sends_anon_key_and_bearer(configured):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["apikey"] = request.headers.get("apikey")
        seen["authorization"] = request.headers.get("authorization")
        return httpx.Response(200, json=_user_json())

    with _supabase(handler):
        user = await auth_module.verify_access_token(TOKEN)

    assert user.id == USER_ID
    assert seen["apikey"] == SECRET_ANON
    assert seen["authorization"] == f"Bearer {TOKEN}"


@pytest.mark.parametrize("status", [401, 403])
async def test_rejected_token_is_invalid_not_unavailable(configured, status):
    def handler(_request):
        return httpx.Response(status, json={"code": status, "error_code": "bad_jwt", "msg": "invalid"})

    with _supabase(handler), pytest.raises(AuthInvalidToken):
        await auth_module.verify_access_token(TOKEN)


async def test_rejection_log_keeps_error_code_but_not_token(configured, caplog):
    caplog.set_level(logging.INFO)

    def handler(_request):
        return httpx.Response(403, json={"error_code": "bad_jwt", "msg": f"echo {TOKEN}"})

    with _supabase(handler), pytest.raises(AuthInvalidToken):
        await auth_module.verify_access_token(TOKEN)

    assert "error_code=bad_jwt" in caplog.text
    assert TOKEN not in caplog.text


@pytest.mark.parametrize("status", [429, 500, 502, 503])
async def test_upstream_failure_status_is_unavailable(configured, status):
    def handler(_request):
        return httpx.Response(status, json={"error_code": "over_request_rate_limit"})

    with _supabase(handler), pytest.raises(AuthServiceUnavailable) as info:
        await auth_module.verify_access_token(TOKEN)
    assert info.value.reason == "upstream_status"


async def test_timeout_is_unavailable_with_timeout_reason(configured):
    def handler(request):
        raise httpx.ReadTimeout("slow", request=request)

    with _supabase(handler), pytest.raises(AuthServiceUnavailable) as info:
        await auth_module.verify_access_token(TOKEN)
    assert info.value.reason == "timeout"


async def test_network_error_is_unavailable_with_network_reason(configured):
    def handler(request):
        raise httpx.ConnectError("no route", request=request)

    with _supabase(handler), pytest.raises(AuthServiceUnavailable) as info:
        await auth_module.verify_access_token(TOKEN)
    assert info.value.reason == "network"


async def test_200_without_user_id_is_invalid_token(configured):
    def handler(_request):
        return httpx.Response(200, json={"email": "ana@example.com"})

    with _supabase(handler), pytest.raises(AuthInvalidToken):
        await auth_module.verify_access_token(TOKEN)


def test_error_code_with_unsafe_format_is_not_logged():
    response = httpx.Response(400, json={"error_code": "<script>alert(1)</script>"})
    assert auth_module._safe_error_code(response) is None
    assert auth_module._safe_error_code(httpx.Response(400, text="no json")) is None


# ---------- respuestas HTTP de /api ----------


@pytest.fixture
def client():
    return TestClient(app)


def test_me_without_token_is_401(client):
    assert client.get("/api/me").status_code == 401


def test_me_with_invalid_token_is_401(client):
    with patch.object(auth_module, "verify_access_token", AsyncMock(side_effect=AuthInvalidToken())):
        response = client.get("/api/me", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 401


def test_me_with_unavailable_auth_is_503_with_message(client):
    error = AuthServiceUnavailable("x", reason="upstream_status")
    with patch.object(auth_module, "verify_access_token", AsyncMock(side_effect=error)):
        response = client.get("/api/me", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 503
    assert "no está disponible" in response.json()["detail"]


def test_me_with_missing_configuration_is_503_with_config_message(client):
    error = AuthServiceUnavailable("x", reason="config_missing")
    with patch.object(auth_module, "verify_access_token", AsyncMock(side_effect=error)):
        response = client.get("/api/me", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 503
    assert "no está configurada" in response.json()["detail"]


def test_link_with_unavailable_auth_is_503_not_401(client):
    error = AuthServiceUnavailable("x", reason="timeout")
    payload = {"player_id": str(uuid4())}
    with patch.object(auth_module, "verify_access_token", AsyncMock(side_effect=error)):
        response = client.post(
            "/api/me/game-scores/link", json=payload, headers={"Authorization": f"Bearer {TOKEN}"}
        )
    assert response.status_code == 503


def test_link_with_valid_user_succeeds_when_repository_answers(client):
    player_id = str(uuid4())
    user = AuthUser(id=USER_ID, email="ana@example.com")
    with (
        patch.object(auth_module, "verify_access_token", AsyncMock(return_value=user)),
        patch.object(identity_repository, "list_role_names", AsyncMock(return_value=[])),
        patch.object(identity_repository, "get_profile", AsyncMock(return_value=None)),
        patch.object(identity_repository, "insert_profile", AsyncMock(return_value={"id": str(USER_ID)})),
        patch.object(identity_repository, "get_guest_claim", AsyncMock(return_value=None)),
        patch.object(identity_repository, "insert_guest_claim", AsyncMock(return_value=None)),
        patch.object(identity_repository, "claim_guest_scores", AsyncMock(return_value=2)),
    ):
        response = client.post(
            "/api/me/game-scores/link",
            json={"player_id": player_id},
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
    assert response.status_code == 200
    assert response.json()["linked"] == 2


# ---------- bootstrap de /api/me ----------


async def test_newly_confirmed_user_gets_profile_created_once():
    user = AuthUser(id=USER_ID, email="ana@example.com", display_name="Ana")
    insert = AsyncMock(return_value={"id": str(USER_ID), "display_name": "Ana", "country_code": "CO"})
    with (
        patch.object(identity_repository, "get_profile", AsyncMock(return_value=None)),
        patch.object(identity_repository, "insert_profile", insert),
    ):
        profile = await identity_service.ensure_profile(user)

    insert.assert_awaited_once()
    assert profile["display_name"] == "Ana"


async def test_existing_profile_is_returned_without_insert():
    user = AuthUser(id=USER_ID, email="ana@example.com")
    existing = {"id": str(USER_ID), "display_name": "Ana", "country_code": "CO"}
    insert = AsyncMock()
    with (
        patch.object(identity_repository, "get_profile", AsyncMock(return_value=existing)),
        patch.object(identity_repository, "insert_profile", insert),
    ):
        profile = await identity_service.ensure_profile(user)

    insert.assert_not_awaited()
    assert profile == existing


async def test_repeated_bootstrap_is_idempotent():
    user = AuthUser(id=USER_ID, email="ana@example.com")
    stored = {}

    async def get_profile(user_id):
        return stored.get(str(user_id))

    async def insert_profile(data):
        stored.setdefault(data["id"], data)
        return stored[data["id"]]

    with (
        patch.object(identity_repository, "get_profile", AsyncMock(side_effect=get_profile)),
        patch.object(identity_repository, "insert_profile", AsyncMock(side_effect=insert_profile)),
    ):
        first = await identity_service.ensure_profile(user)
        second = await identity_service.ensure_profile(user)

    assert first == second
    assert len(stored) == 1
