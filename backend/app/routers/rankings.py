"""Rankings públicos de juegos. Sin sesión; `is_me` solo si llega una sesión válida."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import AuthUser, get_optional_user
from app.schemas.rankings import RankingGame, RankingResponse, RankingScope
from app.services.rankings_service import RankingRequestError, get_ranking

router = APIRouter(prefix="/rankings", tags=["rankings"])


@router.get("", response_model=RankingResponse)
async def read_rankings(
    scope: RankingScope = Query("national"),
    game: RankingGame = Query("general"),
    department_code: Optional[str] = Query(None, pattern=r"^[0-9]{2}$"),
    municipality_code: Optional[str] = Query(None, pattern=r"^[0-9]{5}$"),
    limit: int = Query(10, ge=1, le=50),
    viewer: Optional[AuthUser] = Depends(get_optional_user),
):
    """Mejor puntaje por usuario (no se suman partidas). Territorio validado contra el catálogo DANE."""
    try:
        return await get_ranking(
            scope=scope,
            game=game,
            department_code=department_code,
            municipality_code=municipality_code,
            limit=limit,
            viewer_user_id=viewer.id if viewer else None,
        )
    except RankingRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
