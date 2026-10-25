"""Auth tests: JWT validation, roles and dependency behaviour.

Supabase Auth and the identity repository are mocked. No real Auth is needed.
"""

from contextlib import contextmanager
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import (
    AuthInvalidToken,
    AuthServiceUnavailable,
    AuthUser,
    extract_bearer_token,
    get_optional_user,
    require_role,
    require_user,
    verify_access_token,
)
from app.core.config import settings
from app.main import app
from app.repositories.identity_repository import identity_repository

USER_ID = uuid4()
OTHER_USER_ID = uuid4()
TOKEN = "header.payload.signature-test"


def _user(user_id=USER_ID) -> AuthUser:
    return AuthUser(id=user_id, email="ana@example.com", display_name="Ana")


def _profile(user_id=USER_ID) -> dict:
    return {
        "id": str(user_id),
        "display_name": "Ana",
        "country_code": "CO",
        "department_code": None,
        "municipality_code": None,
        "avatar_url": None,
        "created_at": "2026-10-12T10:00:00+00:00",
        "updated_at": "2026-10-12T10:00:00+00:00",
    }


def _probe_app() -> FastAPI:
    """Mini app that exposes each dependency on its own route."""
    probe = FastAPI()

    @probe.get("/optional")
    async def optional_route(user=Depends(get_optional_user)):
        return {"id": str(user.id) if user else None}

    @probe.get("/user")
    async def user_route(user=Depends(require_user)):
        return {"id": str(user.id)}

    @probe.get("/producer")
    async def producer_route(user=Depends(require_role("producer"))):
        return {"id": str(user.id)}

    @probe.get("/buyer")
    async def buyer_route(user=Depends(require_role("buyer"))):
        return {"id": str(user.id)}

    return probe


@pytest.fixture
def probe_client():
    return TestClient(_probe_app())


@pytest.fixture
def valid_token():
    with patch.object(auth_module, "verify_access_token", AsyncMock(return_value=_user())) as mock:
        yield mock


# ========== HEADER PARSING ==========


def test_missing_header_returns_none():
    assert extract_bearer_token(None) is None
    assert extract_bearer_token("") is None


@pytest.mark.parametrize("header", ["Basic abc", "Bearer", "Bearer    ", "Token xyz"])
def test_malformed_header_is_rejected(header):
    with pytest.raises(Exception) as exc_info:
        extract_bearer_token(header)
    assert getattr(exc_info.value, "status_code", None) == 401


def test_bearer_token_is_extracted():
    assert extract_bearer_token(f"Bearer {TOKEN}") == TOKEN


# ========== JWT ABSENTE / INVÁLIDO / VÁLIDO ==========


def test_missing_jwt_is_anonymous_for_optional_routes(probe_client):
    response = probe_client.get("/optional")
    assert response.status_code == 200
    assert response.json() == {"id": None}


def test_missing_jwt_is_401_for_required_user(probe_client):
    response = probe_client.get("/user")
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"


def test_invalid_jwt_is_401(probe_client):
    with patch.object(auth_module, "verify_access_token", AsyncMock(side_effect=AuthInvalidToken())):
        response = probe_client.get("/user", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401


def test_invalid_jwt_is_401_even_on_optional_routes(probe_client):
    with patch.object(auth_module, "verify_access_token", AsyncMock(side_effect=AuthInvalidToken())):
        response = probe_client.get("/optional", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401


def test_auth_service_outage_is_503(probe_client):
    with patch.object(auth_module, "verify_access_token", AsyncMock(side_effect=AuthServiceUnavailable())):
        response = probe_client.get("/user", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 503


def test_valid_user_resolves_id_from_token(probe_client, valid_token):
    response = probe_client.get("/user", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200
    assert response.json() == {"id": str(USER_ID)}
    valid_token.assert_awaited_once_with(TOKEN)


def test_user_id_in_request_is_ignored(probe_client, valid_token):
    """El user_id nunca sale de encabezados o query: solo del token validado."""
    response = probe_client.get(
        f"/user?user_id={OTHER_USER_ID}",
        headers={"Authorization": f"Bearer {TOKEN}", "X-User-Id": str(OTHER_USER_ID)},
    )
    assert response.json() == {"id": str(USER_ID)}


def test_me_endpoint_requires_token():
    client = TestClient(app)
    response = client.get("/api/me")
    assert response.status_code == 401


def test_me_endpoint_returns_identity_from_token(valid_token):
    client = TestClient(app)
    with (
        patch.object(identity_repository, "get_profile", AsyncMock(return_value=_profile())),
        patch.object(identity_repository, "list_role_names", AsyncMock(return_value=["producer"])),
        patch.object(identity_repository, "get_producer_profile", AsyncMock(return_value=None)),
    ):
        response = client.get("/api/me", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(USER_ID)
    assert body["roles"] == ["producer"]
    assert body["profile"]["display_name"] == "Ana"


# ========== ROLES ==========


def test_producer_role_grants_access(probe_client, valid_token):
    with patch.object(identity_repository, "list_role_names", AsyncMock(return_value=["producer"])):
        response = probe_client.get("/producer", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200


def test_buyer_role_grants_buyer_route(probe_client, valid_token):
    with patch.object(identity_repository, "list_role_names", AsyncMock(return_value=["buyer"])):
        response = probe_client.get("/buyer", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 200


def test_wrong_role_is_403(probe_client, valid_token):
    """Comprador sin rol productor: 403, no 401."""
    with patch.object(identity_repository, "list_role_names", AsyncMock(return_value=["buyer"])):
        response = probe_client.get("/producer", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 403


def test_user_without_roles_is_403(probe_client, valid_token):
    with patch.object(identity_repository, "list_role_names", AsyncMock(return_value=[])):
        response = probe_client.get("/buyer", headers={"Authorization": f"Bearer {TOKEN}"})
    assert response.status_code == 403


def test_require_role_rejects_unknown_role():
    with pytest.raises(ValueError):
        require_role("admin")


# ========== VERIFICATION AGAINST SUPABASE AUTH ==========


class _FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


@contextmanager
def _inject(client):
    """Cliente simulado en el cliente compartido de auth; se restaura al salir (sin red)."""
    previous = auth_module._auth_client
    auth_module._auth_client = client
    try:
        yield
    finally:
        auth_module._auth_client = previous


class _FakeClient:
    def __init__(self, response=None, error=None):
        self._response = response
        self._error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers):
        assert url.endswith("/auth/v1/user")
        assert headers["Authorization"].startswith("Bearer ")
        if self._error:
            raise self._error
        return self._response


@pytest.fixture
def configured_supabase(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "anon-test-key")


async def test_verify_returns_user_from_supabase_response(configured_supabase):
    payload = {
        "id": str(USER_ID),
        "email": "ana@example.com",
        "user_metadata": {"display_name": "  Ana  "},
    }
    client = _FakeClient(response=_FakeResponse(200, payload))
    with _inject(client):
        user = await verify_access_token(TOKEN)
    assert user.id == USER_ID
    assert user.email == "ana@example.com"
    assert user.display_name == "Ana"


async def test_verify_rejects_token_refused_by_supabase(configured_supabase):
    client = _FakeClient(response=_FakeResponse(401))
    with _inject(client):
        with pytest.raises(AuthInvalidToken):
            await verify_access_token(TOKEN)


async def test_verify_handles_network_failure(configured_supabase):
    import httpx

    client = _FakeClient(error=httpx.ConnectError("sin red"))
    with _inject(client):
        with pytest.raises(AuthServiceUnavailable):
            await verify_access_token(TOKEN)


async def test_verify_without_configuration_is_unavailable(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", "")
    with pytest.raises(AuthServiceUnavailable):
        await verify_access_token(TOKEN)
