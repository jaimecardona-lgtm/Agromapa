"""Autenticación de usuarios con Supabase Auth.

El frontend envía `Authorization: Bearer <access_token>`. El backend valida el
token contra Supabase Auth (GET /auth/v1/user) y deriva el user_id de esa
respuesta. Nunca se confía en un user_id enviado en el body, la query o un header.

La validación remota funciona con cualquier algoritmo de firma que use el
proyecto (HS256 heredado o asimétrico), sin manejar secretos JWT en el backend.
Ningún token se registra en logs.
"""

import asyncio
import logging
import re
import time
from typing import Optional
from uuid import UUID

import httpx
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.repositories.identity_repository import identity_repository

logger = logging.getLogger(__name__)

AUTH_TIMEOUT_SECONDS = 5.0
# Un reintento automático sólo para fallos transitorios (timeout, red, 5xx). Espera corta entre intentos.
AUTH_MAX_ATTEMPTS = 2
AUTH_RETRY_DELAY_SECONDS = 0.3
_RETRYABLE_REASONS = frozenset({"timeout", "network"})

# Cliente HTTP compartido: reutiliza conexiones (keep-alive, TLS) entre validaciones. Se cierra en el lifespan.
_auth_client: Optional[httpx.AsyncClient] = None
ROLE_PRODUCER = "producer"
ROLE_BUYER = "buyer"
BUSINESS_ROLES = (ROLE_PRODUCER, ROLE_BUYER)


class AuthUser(BaseModel):
    """Usuario autenticado. Los roles NO viven en el token: se leen de user_roles."""

    id: UUID
    email: Optional[str] = None
    display_name: Optional[str] = None


class AuthInvalidToken(Exception):
    """El token no es válido, está vencido o fue revocado."""


class AuthServiceUnavailable(Exception):
    """Supabase Auth no respondió o la configuración está incompleta.

    `reason` identifica la causa para logs y tests:
    config_missing | timeout | network | upstream_status.
    """

    def __init__(
        self,
        message: str = "Supabase Auth no disponible",
        reason: str = "unavailable",
        status_code: Optional[int] = None,
    ):
        super().__init__(message)
        self.reason = reason
        self.status_code = status_code

    @property
    def retryable(self) -> bool:
        """Solo fallos transitorios: timeout, error de red o 5xx de Supabase. Nunca 401/403 ni configuración."""
        if self.reason in _RETRYABLE_REASONS:
            return True
        return self.reason == "upstream_status" and self.status_code is not None and self.status_code >= 500


def get_auth_client() -> httpx.AsyncClient:
    """Cliente HTTP compartido hacia Supabase Auth (lazy, con límites explícitos)."""
    global _auth_client
    if _auth_client is None:
        _auth_client = httpx.AsyncClient(
            timeout=AUTH_TIMEOUT_SECONDS,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _auth_client


async def close_auth_client() -> None:
    """Cierra el cliente compartido al apagar la aplicación."""
    global _auth_client
    if _auth_client is not None:
        await _auth_client.aclose()
    _auth_client = None


# Código de error que Supabase devuelve en el cuerpo (p. ej. "bad_jwt"). Es un dato no sensible
# y se valida con una expresión estricta antes de registrarlo.
_ERROR_CODE_PATTERN = re.compile(r"[A-Za-z0-9_]{1,60}")


def _unauthorized(detail: str = "Autenticación requerida") -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    """Devuelve el token del encabezado, None si no hay encabezado, o 401 si está mal formado."""
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("Encabezado Authorization inválido")
    return token


def _display_name_from(data: dict) -> Optional[str]:
    metadata = data.get("user_metadata") or {}
    name = metadata.get("display_name") or metadata.get("full_name")
    if isinstance(name, str) and name.strip():
        return name.strip()[:120]
    return None


def _safe_error_code(response: httpx.Response) -> Optional[str]:
    """Código de error de Supabase (solo si tiene formato seguro). Nunca el cuerpo completo."""
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    code = body.get("error_code") or body.get("code")
    if isinstance(code, (str, int)) and _ERROR_CODE_PATTERN.fullmatch(str(code)):
        return str(code)
    return None


def missing_auth_settings() -> list[str]:
    """Nombres (nunca valores) de la configuración de Supabase Auth que faltan."""
    required = {"SUPABASE_URL": settings.SUPABASE_URL, "SUPABASE_ANON_KEY": settings.SUPABASE_ANON_KEY}
    return [name for name, value in required.items() if not value]


def _log_validation(outcome: str, attempt: int, started: float, status_code: Optional[int] = None,
                    error_code: Optional[str] = None) -> None:
    """Registro de validación sin token, sin cabeceras y sin claves: solo resultado, intento y tiempo."""
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    fields = f"attempt={attempt} elapsed_ms={elapsed_ms}"
    if status_code is not None:
        fields += f" status={status_code}"
    if error_code is not None:
        fields += f" error_code={error_code}"
    if outcome == "success":
        logger.info("auth validation success %s", fields)
    elif outcome == "rejected":
        logger.info("auth validation rejected %s", fields)
    else:
        logger.warning("auth validation %s %s", outcome, fields)


async def _validate_once(token: str, attempt: int) -> AuthUser:
    url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user"
    headers = {"apikey": settings.SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
    started = time.perf_counter()

    try:
        response = await get_auth_client().get(url, headers=headers)
    except httpx.TimeoutException as exc:
        _log_validation("timeout", attempt, started)
        raise AuthServiceUnavailable("Supabase Auth no respondió a tiempo", reason="timeout") from exc
    except httpx.HTTPError as exc:
        _log_validation("network", attempt, started, error_code=type(exc).__name__)
        raise AuthServiceUnavailable("Supabase Auth no disponible", reason="network") from exc

    if response.status_code in (401, 403):
        _log_validation("rejected", attempt, started, response.status_code, _safe_error_code(response))
        raise AuthInvalidToken("Token rechazado por Supabase Auth")
    if response.status_code != 200:
        _log_validation("upstream_status", attempt, started, response.status_code, _safe_error_code(response))
        raise AuthServiceUnavailable(
            "Respuesta inesperada de Supabase Auth", reason="upstream_status", status_code=response.status_code
        )

    data = response.json()
    try:
        user_id = UUID(str(data["id"]))
    except (KeyError, ValueError) as exc:
        raise AuthInvalidToken("Respuesta de Supabase sin usuario válido") from exc

    _log_validation("success", attempt, started)
    return AuthUser(
        id=user_id,
        email=data.get("email"),
        display_name=_display_name_from(data),
    )


async def verify_access_token(token: str) -> AuthUser:
    """Valida el access token con Supabase Auth y devuelve el usuario que representa.

    Resultados:
    - usuario válido -> AuthUser
    - token inexistente, inválido, vencido o revocado (401/403 de Supabase) -> AuthInvalidToken (401), sin reintento
    - timeout, error de red o 5xx -> hasta AUTH_MAX_ATTEMPTS intentos; si todos fallan -> AuthServiceUnavailable (503)
    - configuración faltante -> AuthServiceUnavailable (503), sin reintento
    """
    missing = missing_auth_settings()
    if missing:
        logger.error("Autenticación no configurada: faltan variables de entorno %s", ", ".join(missing))
        raise AuthServiceUnavailable("Supabase Auth no está configurado", reason="config_missing")

    for attempt in range(1, AUTH_MAX_ATTEMPTS + 1):
        try:
            return await _validate_once(token, attempt)
        except AuthServiceUnavailable as exc:
            if not exc.retryable or attempt == AUTH_MAX_ATTEMPTS:
                raise
            await asyncio.sleep(AUTH_RETRY_DELAY_SECONDS)
    raise AssertionError("unreachable: el bucle siempre retorna o lanza")


async def _authenticate(token: str) -> AuthUser:
    try:
        return await verify_access_token(token)
    except AuthInvalidToken:
        raise _unauthorized("Sesión inválida o expirada")
    except AuthServiceUnavailable as exc:
        detail = (
            "La autenticación del servidor no está configurada."
            if exc.reason == "config_missing"
            else "El servicio de autenticación no está disponible en este momento."
        )
        raise HTTPException(status_code=503, detail=detail)


async def get_optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[AuthUser]:
    """Usuario autenticado, o None para invitados. Un token presente pero inválido responde 401."""
    token = extract_bearer_token(authorization)
    if token is None:
        return None
    return await _authenticate(token)


async def require_user(user: Optional[AuthUser] = Depends(get_optional_user)) -> AuthUser:
    """Exige sesión válida."""
    if user is None:
        raise _unauthorized()
    return user


def require_role(role: str):
    """Dependencia que exige sesión y un rol activo en user_roles (403 si falta el rol)."""
    if role not in BUSINESS_ROLES:
        raise ValueError(f"Rol no válido para dependencia: {role}")

    async def _dependency(user: AuthUser = Depends(require_user)) -> AuthUser:
        roles = await identity_repository.list_role_names(user.id)
        if role not in roles:
            raise HTTPException(status_code=403, detail=f"Se requiere el rol {role} para esta acción.")
        return user

    return _dependency
