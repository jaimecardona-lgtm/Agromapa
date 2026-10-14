"""Autenticación de usuarios con Supabase Auth.

El frontend envía `Authorization: Bearer <access_token>`. El backend valida el
token contra Supabase Auth (GET /auth/v1/user) y deriva el user_id de esa
respuesta. Nunca se confía en un user_id enviado en el body, la query o un header.

La validación remota funciona con cualquier algoritmo de firma que use el
proyecto (HS256 heredado o asimétrico), sin manejar secretos JWT en el backend.
Ningún token se registra en logs.
"""

import logging
from typing import Optional
from uuid import UUID

import httpx
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.repositories.identity_repository import identity_repository

logger = logging.getLogger(__name__)

AUTH_TIMEOUT_SECONDS = 5.0
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
    """Supabase Auth no respondió o la configuración está incompleta."""


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


async def verify_access_token(token: str) -> AuthUser:
    """Valida el access token con Supabase Auth y devuelve el usuario que representa."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_ANON_KEY:
        raise AuthServiceUnavailable("Supabase Auth no está configurado")

    url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user"
    headers = {"apikey": settings.SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient(timeout=AUTH_TIMEOUT_SECONDS) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        logger.error("Supabase Auth no disponible: %s", type(exc).__name__)
        raise AuthServiceUnavailable("Supabase Auth no disponible") from exc

    if response.status_code in (401, 403):
        raise AuthInvalidToken("Token rechazado por Supabase Auth")
    if response.status_code != 200:
        logger.error("Supabase Auth respondió con estado %s", response.status_code)
        raise AuthServiceUnavailable("Respuesta inesperada de Supabase Auth")

    data = response.json()
    try:
        user_id = UUID(str(data["id"]))
    except (KeyError, ValueError) as exc:
        raise AuthInvalidToken("Respuesta de Supabase sin usuario válido") from exc

    return AuthUser(
        id=user_id,
        email=data.get("email"),
        display_name=_display_name_from(data),
    )


async def _authenticate(token: str) -> AuthUser:
    try:
        return await verify_access_token(token)
    except AuthInvalidToken:
        raise _unauthorized("Sesión inválida o expirada")
    except AuthServiceUnavailable:
        raise HTTPException(
            status_code=503,
            detail="El servicio de autenticación no está disponible en este momento.",
        )


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
