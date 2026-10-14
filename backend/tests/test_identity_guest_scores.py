"""Guest vs registered game scores, and the guarded guest-score link.

Repositories and Supabase Auth are mocked. The tests check that user_id is
derived from the validated token and never from the request body.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import AuthUser
from app.main import app
from app.repositories.game_scores_repository import GameScoresRepository
from app.repositories.identity_repository import identity_repository

USER_ID = uuid4()
OTHER_USER_ID = uuid4()
PLAYER_ID = uuid4()
AUTH = {"Authorization": "Bearer test-token"}
CREATED = "2026-10-12T10:00:00+00:00"


def _score_row(user_id=None):
    return {
        "id": str(uuid4()),
        "player_alias": "Ana",
        "game_slug": "cosechas",
        "difficulty": None,
        "score": 1200,
        "correct_answers": None,
        "wrong_answers": None,
        "best_streak": None,
        "lives_remaining": None,
        "duration_seconds": 30,
        "created_at": CREATED,
        "user_id": str(user_id) if user_id else None,
    }


def _cosechas_payload(**extra):
    payload = {
        "player_id": str(PLAYER_ID),
        "player_alias": "Ana",
        "game_slug": "cosechas",
        "score": 1200,
        "duration_seconds": 30,
    }
    payload.update(extra)
    return payload


def _auth_as(user_id):
    return patch.object(
        auth_module,
        "verify_access_token",
        AsyncMock(return_value=AuthUser(id=user_id, email="ana@example.com")),
    )


@pytest.fixture
def client():
    return TestClient(app)


# ========== SCORES ==========


def test_guest_score_is_saved_with_null_user_id(client):
    insert = AsyncMock(return_value=_score_row())
    with patch.object(GameScoresRepository, "insert_score", insert):
        response = client.post("/api/games/scores", json=_cosechas_payload())

    assert response.status_code == 201
    saved = insert.await_args.args[0]
    assert saved["user_id"] is None
    assert saved["player_id"] == str(PLAYER_ID)


def test_registered_score_takes_user_id_from_token(client):
    insert = AsyncMock(return_value=_score_row(USER_ID))
    with _auth_as(USER_ID), patch.object(GameScoresRepository, "insert_score", insert):
        response = client.post("/api/games/scores", headers=AUTH, json=_cosechas_payload())

    assert response.status_code == 201
    assert insert.await_args.args[0]["user_id"] == str(USER_ID)


def test_user_id_in_body_is_ignored_for_scores(client):
    """El body no puede asignar la partida a otra cuenta."""
    insert = AsyncMock(return_value=_score_row(USER_ID))
    with _auth_as(USER_ID), patch.object(GameScoresRepository, "insert_score", insert):
        client.post(
            "/api/games/scores",
            headers=AUTH,
            json=_cosechas_payload(user_id=str(OTHER_USER_ID)),
        )
    assert insert.await_args.args[0]["user_id"] == str(USER_ID)


def test_invalid_token_on_score_is_401_not_silent_guest(client):
    from app.core.auth import AuthInvalidToken

    insert = AsyncMock(return_value=_score_row())
    with (
        patch.object(auth_module, "verify_access_token", AsyncMock(side_effect=AuthInvalidToken())),
        patch.object(GameScoresRepository, "insert_score", insert),
    ):
        response = client.post("/api/games/scores", headers=AUTH, json=_cosechas_payload())
    assert response.status_code == 401
    insert.assert_not_awaited()


# ========== LINK GUEST SCORES ==========


def test_link_requires_authentication(client):
    response = client.post("/api/me/game-scores/link", json={"player_id": str(PLAYER_ID)})
    assert response.status_code == 401


def test_link_claims_guest_scores_for_the_account(client):
    claim_insert = AsyncMock()
    claim_scores = AsyncMock(return_value=3)
    with (
        _auth_as(USER_ID),
        patch.object(identity_repository, "get_guest_claim", AsyncMock(return_value=None)),
        patch.object(identity_repository, "insert_guest_claim", claim_insert),
        patch.object(identity_repository, "claim_guest_scores", claim_scores),
    ):
        response = client.post(
            "/api/me/game-scores/link", headers=AUTH, json={"player_id": str(PLAYER_ID)}
        )

    assert response.status_code == 200
    assert response.json()["linked"] == 3
    claim_insert.assert_awaited_once_with(PLAYER_ID, USER_ID)
    claim_scores.assert_awaited_once_with(PLAYER_ID, USER_ID)


def test_link_rejects_player_already_claimed_by_another_account(client):
    """Un player_id no puede reasignarse: 409 y ninguna partida se mueve."""
    claim_scores = AsyncMock(return_value=5)
    with (
        _auth_as(USER_ID),
        patch.object(
            identity_repository,
            "get_guest_claim",
            AsyncMock(return_value={"player_id": str(PLAYER_ID), "user_id": str(OTHER_USER_ID)}),
        ),
        patch.object(identity_repository, "claim_guest_scores", claim_scores),
    ):
        response = client.post(
            "/api/me/game-scores/link", headers=AUTH, json={"player_id": str(PLAYER_ID)}
        )

    assert response.status_code == 409
    claim_scores.assert_not_awaited()


def test_link_is_idempotent_for_the_same_account(client):
    insert_claim = AsyncMock()
    with (
        _auth_as(USER_ID),
        patch.object(
            identity_repository,
            "get_guest_claim",
            AsyncMock(return_value={"player_id": str(PLAYER_ID), "user_id": str(USER_ID)}),
        ),
        patch.object(identity_repository, "insert_guest_claim", insert_claim),
        patch.object(identity_repository, "claim_guest_scores", AsyncMock(return_value=0)),
    ):
        response = client.post(
            "/api/me/game-scores/link", headers=AUTH, json={"player_id": str(PLAYER_ID)}
        )

    assert response.status_code == 200
    assert response.json()["linked"] == 0
    insert_claim.assert_not_awaited()


def test_link_race_lost_to_another_account_is_409(client):
    """Dos cuentas reclaman a la vez: la clave primaria decide y la segunda recibe 409."""
    with (
        _auth_as(USER_ID),
        patch.object(
            identity_repository,
            "get_guest_claim",
            AsyncMock(
                side_effect=[
                    None,
                    {"player_id": str(PLAYER_ID), "user_id": str(OTHER_USER_ID)},
                ]
            ),
        ),
        patch.object(
            identity_repository,
            "insert_guest_claim",
            AsyncMock(side_effect=RuntimeError("duplicate key")),
        ),
        patch.object(identity_repository, "claim_guest_scores", AsyncMock(return_value=0)) as claim_scores,
    ):
        response = client.post(
            "/api/me/game-scores/link", headers=AUTH, json={"player_id": str(PLAYER_ID)}
        )

    assert response.status_code == 409
    claim_scores.assert_not_awaited()


def test_link_rejects_extra_fields(client):
    """user_id en el body de vinculación no tiene efecto: se rechaza."""
    with _auth_as(USER_ID):
        response = client.post(
            "/api/me/game-scores/link",
            headers=AUTH,
            json={"player_id": str(PLAYER_ID), "user_id": str(OTHER_USER_ID)},
        )
    assert response.status_code == 422
