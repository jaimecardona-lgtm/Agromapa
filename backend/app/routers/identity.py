"""Identity routes (/api/me). Every route derives the user from the validated token."""

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import ROLE_BUYER, ROLE_PRODUCER, AuthUser, require_role, require_user
from app.schemas.game_scores import GameScoreRecord
from app.schemas.identity import (
    BuyerProfileResponse,
    BuyerProfileUpdate,
    GuestScoreLinkRequest,
    GuestScoreLinkResponse,
    MeResponse,
    ProducerProfileResponse,
    ProducerProfileUpdate,
    ProfileResponse,
    ProfileUpdate,
    Role,
    RolesResponse,
)
from app.schemas.operational import FarmResponse, ProductionOfferResponse
from app.services import identity_service
from app.services.identity_service import IdentityConflictError
from app.services.operational_service import list_my_farms, list_my_offers

router = APIRouter(prefix="/me", tags=["identity"])

MAX_SCORES_PAGE = 50


def _conflict(exc: IdentityConflictError) -> HTTPException:
    return HTTPException(status_code=409, detail=str(exc))


# ========== PROFILE ==========


@router.get("", response_model=MeResponse)
async def read_me(user: AuthUser = Depends(require_user)):
    """Perfil, roles y perfiles públicos del usuario autenticado."""
    return await identity_service.get_me(user)


@router.patch("", response_model=ProfileResponse)
async def update_me(update: ProfileUpdate, user: AuthUser = Depends(require_user)):
    """Actualiza nombre y ubicación. Roles y ownership no se modifican aquí."""
    return await identity_service.update_profile(user, update)


# ========== ROLES ==========


@router.get("/roles", response_model=RolesResponse)
async def read_roles(user: AuthUser = Depends(require_user)):
    return RolesResponse(roles=await identity_service.get_roles(user.id))


@router.post("/roles/{role}", response_model=RolesResponse)
async def activate_role(role: Role, user: AuthUser = Depends(require_user)):
    """Activa producer o buyer. La misma cuenta puede tener ambos roles."""
    return RolesResponse(roles=await identity_service.activate_role(user, role))


@router.delete("/roles/{role}", response_model=RolesResponse)
async def deactivate_role(role: Role, user: AuthUser = Depends(require_user)):
    """Desactiva un rol. Un productor con fincas activas no puede desactivarse (409)."""
    try:
        return RolesResponse(roles=await identity_service.deactivate_role(user, role))
    except IdentityConflictError as exc:
        raise _conflict(exc)


# ========== ROLE PROFILES ==========


@router.patch("/producer-profile", response_model=ProducerProfileResponse)
async def update_producer_profile(
    update: ProducerProfileUpdate,
    user: AuthUser = Depends(require_role(ROLE_PRODUCER)),
):
    return await identity_service.update_producer_profile(user, update)


@router.patch("/buyer-profile", response_model=BuyerProfileResponse)
async def update_buyer_profile(
    update: BuyerProfileUpdate,
    user: AuthUser = Depends(require_role(ROLE_BUYER)),
):
    return await identity_service.update_buyer_profile(user, update)


# ========== OWN PRODUCTIVE DATA ==========


@router.get("/farms", response_model=list[FarmResponse])
async def read_my_farms(user: AuthUser = Depends(require_role(ROLE_PRODUCER))):
    """Fincas del productor autenticado (incluye inactivas)."""
    return await list_my_farms(user)


@router.get("/offers", response_model=list[ProductionOfferResponse])
async def read_my_offers(user: AuthUser = Depends(require_role(ROLE_PRODUCER))):
    """Ofertas de todas las fincas del productor autenticado."""
    return await list_my_offers(user)


# ========== GAME RESULTS ==========


@router.get("/game-scores", response_model=list[GameScoreRecord])
async def read_my_game_scores(user: AuthUser = Depends(require_user)):
    """Partidas guardadas en la cuenta, más recientes primero."""
    return await identity_service.list_user_scores(user, MAX_SCORES_PAGE)


@router.post("/game-scores/link", response_model=GuestScoreLinkResponse)
async def link_guest_scores(payload: GuestScoreLinkRequest, user: AuthUser = Depends(require_user)):
    """Vincula las partidas de un player_id de invitado a la cuenta autenticada (una sola vez)."""
    try:
        linked = await identity_service.link_guest_scores(user, payload.player_id)
    except IdentityConflictError as exc:
        raise _conflict(exc)
    return GuestScoreLinkResponse(player_id=payload.player_id, linked=linked)
