"""Resiliencia de la validación de sesión: reintento acotado, cliente compartido y logs sin secretos.

Supabase Auth se simula con httpx.MockTransport. No hay red ni credenciales reales.
"""

import logging
from contextlib import contextmanager
from uuid import uuid4

import httpx
import pytest

from app.core import auth as auth_module
from app.core.auth import AuthInvalidToken, AuthServiceUnavailable
from app.core.config import settings

USER_ID = uuid4()
SECRET_ANON = "anon-sentinel-DO-NOT-LOG-123"
SECRET_SERVICE = "service-sentinel-DO-NOT-LOG-456"
TOKEN = "session-sentinel-DO-NOT-LOG-789"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_ANON_KEY", SECRET_ANON)
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", SECRET_SERVICE)
    monkeypatch.setattr(auth_module, "AUTH_RETRY_DELAY_SECONDS", 0)


@contextmanager
def _supabase(responders):
    """Responde a cada llamada con el siguiente elemento: Response o excepción. Cuenta las llamadas."""
    calls = []
    queue = list(responders)

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        item = queue.pop(0) if len(queue) > 1 else queue[0]
        if isinstance(item, Exception):
            raise item
        return item

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    previous = auth_module._auth_client
    auth_module._auth_client = client
    try:
        yield calls
    finally:
        auth_module._auth_client = previous


def _ok():
    return httpx.Response(200, json={"id": str(USER_ID), "email": "ana@example.com"})


def _status(code):
    return httpx.Response(code, json={"code": code, "error_code": "bad_jwt", "msg": "x"})


async def test_success_on_first_attempt_calls_once():
    with _supabase([_ok()]) as calls:
        user = await auth_module.verify_access_token(TOKEN)

    assert user.id == USER_ID
    assert len(calls) == 1


async def test_timeout_then_success_retries_once(caplog):
    caplog.set_level(logging.INFO)
    with _supabase([httpx.ReadTimeout("lento", request=None), _ok()]) as calls:
        user = await auth_module.verify_access_token(TOKEN)

    assert user.id == USER_ID
    assert len(calls) == 2
    assert "auth validation timeout attempt=1" in caplog.text
    assert "auth validation success attempt=2" in caplog.text


async def test_timeout_twice_gives_503_after_two_attempts():
    with _supabase([httpx.ReadTimeout("lento", request=None)]) as calls:
        with pytest.raises(AuthServiceUnavailable) as info:
            await auth_module.verify_access_token(TOKEN)

    assert info.value.reason == "timeout"
    assert len(calls) == auth_module.AUTH_MAX_ATTEMPTS == 2


async def test_network_error_then_success_retries_once():
    with _supabase([httpx.ConnectError("sin ruta", request=None), _ok()]) as calls:
        user = await auth_module.verify_access_token(TOKEN)

    assert user.id == USER_ID
    assert len(calls) == 2


async def test_upstream_5xx_then_success_retries_once():
    with _supabase([httpx.Response(503, text="maintenance"), _ok()]) as calls:
        user = await auth_module.verify_access_token(TOKEN)

    assert user.id == USER_ID
    assert len(calls) == 2


async def test_upstream_5xx_twice_is_503_with_status_recorded():
    with _supabase([httpx.Response(502, text="bad gateway")]) as calls:
        with pytest.raises(AuthServiceUnavailable) as info:
            await auth_module.verify_access_token(TOKEN)

    assert info.value.reason == "upstream_status"
    assert info.value.status_code == 502
    assert len(calls) == 2


async def test_401_is_not_retried():
    with _supabase([_status(401)]) as calls:
        with pytest.raises(AuthInvalidToken):
            await auth_module.verify_access_token(TOKEN)

    assert len(calls) == 1


async def test_403_is_not_retried():
    with _supabase([_status(403)]) as calls:
        with pytest.raises(AuthInvalidToken):
            await auth_module.verify_access_token(TOKEN)

    assert len(calls) == 1


async def test_non_5xx_upstream_status_is_not_retried():
    with _supabase([httpx.Response(404, text="nope")]) as calls:
        with pytest.raises(AuthServiceUnavailable) as info:
            await auth_module.verify_access_token(TOKEN)

    assert info.value.retryable is False
    assert len(calls) == 1


async def test_missing_configuration_is_not_retried(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "")
    with _supabase([_ok()]) as calls:
        with pytest.raises(AuthServiceUnavailable) as info:
            await auth_module.verify_access_token(TOKEN)

    assert info.value.reason == "config_missing"
    assert calls == []


async def test_no_secrets_in_logs_on_retry_and_failure(caplog):
    caplog.set_level(logging.DEBUG)
    with _supabase([httpx.ReadTimeout("lento", request=None)]):
        with pytest.raises(AuthServiceUnavailable):
            await auth_module.verify_access_token(TOKEN)

    for secret in (TOKEN, SECRET_ANON, SECRET_SERVICE):
        assert secret not in caplog.text
    assert "Bearer" not in caplog.text


async def test_shared_client_is_reused_and_closed_on_shutdown(monkeypatch):
    monkeypatch.setattr(auth_module, "_auth_client", None)

    first = auth_module.get_auth_client()
    second = auth_module.get_auth_client()
    assert first is second

    await auth_module.close_auth_client()
    assert first.is_closed
    assert auth_module._auth_client is None

    third = auth_module.get_auth_client()
    assert third is not first
    assert not third.is_closed
    await auth_module.close_auth_client()
