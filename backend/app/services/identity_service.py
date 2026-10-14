"""Identity business logic: profile, roles, producer/buyer linkage, guest score claims."""

import logging
from uuid import UUID

from app.core.auth import ROLE_BUYER, ROLE_PRODUCER, AuthUser
from app.repositories.identity_repository import identity_repository
from app.schemas.game_scores import GameScoreRecord
from app.schemas.identity import (
    BuyerProfileResponse,
    BuyerProfileUpdate,
    MeResponse,
    ProducerProfileResponse,
    ProducerProfileUpdate,
    ProfileResponse,
    ProfileUpdate,
)

logger = logging.getLogger(__name__)

DEFAULT_DISPLAY_NAME = "Usuario"
MAX_USER_SCORES = 50


class IdentityConflictError(Exception):
    """La operación contradice el estado actual (p. ej. desactivar un productor con fincas activas)."""


def _default_display_name(user: AuthUser) -> str:
    if user.display_name:
        return user.display_name[:120]
    if user.email and "@" in user.email:
        local_part = user.email.split("@", 1)[0].strip()
        if local_part:
            return local_part[:120]
    return DEFAULT_DISPLAY_NAME


async def ensure_profile(user: AuthUser) -> dict:
    """Crea el perfil la primera vez que el usuario autenticado llega al backend."""
    existing = await identity_repository.get_profile(user.id)
    if existing:
        return existing
    return await identity_repository.insert_profile(
        {
            "id": str(user.id),
            "display_name": _default_display_name(user),
            "country_code": "CO",
        }
    )


async def get_roles(user_id: UUID) -> list[str]:
    return await identity_repository.list_role_names(user_id)


async def get_me(user: AuthUser) -> MeResponse:
    profile = await ensure_profile(user)
    roles = await get_roles(user.id)

    producer_profile = None
    if ROLE_PRODUCER in roles:
        row = await identity_repository.get_producer_profile(user.id)
        producer_profile = ProducerProfileResponse(**row) if row else None

    buyer_profile = None
    if ROLE_BUYER in roles:
        row = await identity_repository.get_buyer_profile(user.id)
        buyer_profile = BuyerProfileResponse(**row) if row else None

    return MeResponse(
        id=user.id,
        email=user.email,
        profile=ProfileResponse(**profile),
        roles=roles,
        producer_profile=producer_profile,
        buyer_profile=buyer_profile,
    )


async def update_profile(user: AuthUser, update: ProfileUpdate) -> ProfileResponse:
    profile = await ensure_profile(user)
    data = update.model_dump(exclude_unset=True)
    if not data:
        return ProfileResponse(**profile)
    row = await identity_repository.update_profile(user.id, data)
    if row is None:
        raise RuntimeError("No se pudo actualizar el perfil")
    return ProfileResponse(**row)


async def activate_role(user: AuthUser, role: str) -> list[str]:
    """Activa un rol. Productor crea/reactiva su registro en producers (sin duplicar)."""
    profile = await ensure_profile(user)

    await identity_repository.add_role(user.id, role)

    if role == ROLE_PRODUCER:
        await identity_repository.ensure_producer_profile(user.id)
        await _ensure_producer_for_user(user, profile.get("display_name") or DEFAULT_DISPLAY_NAME)
    elif role == ROLE_BUYER:
        await identity_repository.ensure_buyer_profile(user.id)

    return await get_roles(user.id)


async def deactivate_role(user: AuthUser, role: str) -> list[str]:
    """Desactiva un rol de forma reversible; no borra datos productivos.

    Estrategia para productor: si tiene fincas activas, se rechaza (409) para no
    dejar ofertas huérfanas visibles. Si no, el registro en producers se marca
    inactivo: sus ofertas dejan de aparecer en la vista pública, pero el
    historial se conserva y se reactiva al volver a activar el rol.
    """
    roles = await get_roles(user.id)
    if role not in roles:
        return roles

    if role == ROLE_PRODUCER:
        producer = await identity_repository.get_producer_by_user(user.id)
        if producer and producer.get("active"):
            active_farms = await identity_repository.count_active_farms(UUID(str(producer["id"])))
            if active_farms > 0:
                raise IdentityConflictError(
                    "Desactiva o transfiere tus fincas activas antes de quitar el rol productor."
                )
            await identity_repository.set_producer_active(UUID(str(producer["id"])), False)

    await identity_repository.remove_role(user.id, role)
    return await get_roles(user.id)


async def update_producer_profile(user: AuthUser, update: ProducerProfileUpdate) -> ProducerProfileResponse:
    await identity_repository.ensure_producer_profile(user.id)
    data = update.model_dump(exclude_unset=True)
    row = (
        await identity_repository.update_producer_profile(user.id, data)
        if data
        else await identity_repository.get_producer_profile(user.id)
    )
    return ProducerProfileResponse(**row)


async def update_buyer_profile(user: AuthUser, update: BuyerProfileUpdate) -> BuyerProfileResponse:
    await identity_repository.ensure_buyer_profile(user.id)
    data = update.model_dump(exclude_unset=True)
    row = (
        await identity_repository.update_buyer_profile(user.id, data)
        if data
        else await identity_repository.get_buyer_profile(user.id)
    )
    return BuyerProfileResponse(**row)


async def link_guest_scores(user: AuthUser, player_id: UUID) -> int:
    """Vincula las partidas de invitado de `player_id` a la cuenta autenticada.

    Reglas:
    - Un player_id solo puede reclamarse una vez. Si ya pertenece a otra cuenta, 409.
    - Solo se actualizan partidas con user_id NULL: nunca se reasigna una partida.
    - La clave primaria de guest_score_claims resuelve carreras entre dos cuentas.
    - Repetir la llamada con la misma cuenta es idempotente.
    """
    claim = await identity_repository.get_guest_claim(player_id)
    if claim is not None and str(claim["user_id"]) != str(user.id):
        raise IdentityConflictError("Este juego ya está vinculado a otra cuenta.")

    if claim is None:
        try:
            await identity_repository.insert_guest_claim(player_id, user.id)
        except Exception:
            # Otra petición reclamó el mismo player_id a la vez: se revalida.
            claim = await identity_repository.get_guest_claim(player_id)
            if claim is None or str(claim["user_id"]) != str(user.id):
                raise IdentityConflictError("Este juego ya está vinculado a otra cuenta.")

    return await identity_repository.claim_guest_scores(player_id, user.id)


async def list_user_scores(user: AuthUser, limit: int = MAX_USER_SCORES) -> list[GameScoreRecord]:
    rows = await identity_repository.list_user_game_scores(user.id, min(limit, MAX_USER_SCORES))
    return [GameScoreRecord(**row) for row in rows]


async def _ensure_producer_for_user(user: AuthUser, display_name: str) -> dict:
    """Un solo registro productor por cuenta: reactiva el existente o crea uno nuevo."""
    existing = await identity_repository.get_producer_by_user(user.id)
    if existing:
        if not existing.get("active"):
            await identity_repository.set_producer_active(UUID(str(existing["id"])), True)
            existing["active"] = True
        return existing
    return await identity_repository.insert_producer_for_user(user.id, display_name)
