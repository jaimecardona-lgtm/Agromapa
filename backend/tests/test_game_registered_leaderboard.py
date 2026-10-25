"""Registered-player leaderboard (territorial filters) and the expired-session contract.

No Supabase or Auth: the repository is replaced by in-memory rows.
"""

from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core import auth as auth_module
from app.core.auth import AuthInvalidToken, AuthUser
from app.main import app
from app.repositories.game_scores_repository import GameScoresRepository

ANA = uuid4()
LUIS = uuid4()
MARIA = uuid4()
TS = "2026-10-02T10:00:00+00:00"

PROFILES = {
    str(ANA): {
        "id": str(ANA),
        "display_name": "Ana",
        "country_code": "CO",
        "department_code": "76",
        "municipality_code": "76001",
        "email": "ana@private.example",
    },
    str(LUIS): {
        "id": str(LUIS),
        "display_name": "Luis",
        "country_code": "CO",
        "department_code": "05",
        "municipality_code": "05001",
        "email": "luis@private.example",
    },
    str(MARIA): {
        "id": str(MARIA),
        "display_name": "María",
        "country_code": "CO",
        "department_code": "76",
        "municipality_code": "76111",
        "email": "maria@private.example",
    },
}

# Orden como lo devuelve la consulta: score DESC, created_at ASC.
CANDIDATES = [
    {"user_id": str(ANA), "score": 900, "difficulty": "avanzado", "created_at": TS},
    {"user_id": str(LUIS), "score": 850, "difficulty": "basico", "created_at": TS},
    {"user_id": str(ANA), "score": 400, "difficulty": "basico", "created_at": TS},  # peor marca de Ana
    {"user_id": str(MARIA), "score": 700, "difficulty": "basico", "created_at": TS},
]

SAVED_SCORES: list[dict] = []


async def fake_registered_scores(self, game_slug, user_ids=None):
    rows = [dict(r) for r in CANDIDATES]
    if user_ids is not None:
        rows = [r for r in rows if r["user_id"] in set(user_ids)]
    return rows


async def fake_territory_profiles(self, department_code=None, municipality_code=None):
    result = []
    for profile in PROFILES.values():
        if department_code and profile["department_code"] != department_code:
            continue
        if municipality_code and profile["municipality_code"] != municipality_code:
            continue
        result.append({"id": profile["id"]})
    return result


async def fake_profiles(self, user_ids):
    return {uid: dict(PROFILES[uid]) for uid in user_ids if uid in PROFILES}


async def fake_insert_score(self, data):
    SAVED_SCORES.append(data)
    return {
        "id": str(uuid4()),
        "player_alias": data.get("player_alias"),
        "game_slug": data["game_slug"],
        "difficulty": data.get("difficulty"),
        "score": data["score"],
        "correct_answers": None,
        "wrong_answers": None,
        "best_streak": None,
        "lives_remaining": None,
        "duration_seconds": None,
        "created_at": TS,
    }


@pytest.fixture(autouse=True)
def _fakes():
    SAVED_SCORES.clear()
    with (
        patch.object(GameScoresRepository, "list_registered_scores", fake_registered_scores),
        patch.object(GameScoresRepository, "list_territory_profiles", fake_territory_profiles),
        patch.object(GameScoresRepository, "get_profiles_by_ids", fake_profiles),
        patch.object(GameScoresRepository, "insert_score", fake_insert_score),
    ):
        yield


@pytest.fixture
def client():
    return TestClient(app)


# ========== REGISTERED LEADERBOARD ==========


def test_registered_leaderboard_returns_best_score_once_per_user(client):
    response = client.get("/api/games/leaderboard/cosechas/registered")

    assert response.status_code == 200
    data = response.json()["data"]
    assert [row["display_name"] for row in data] == ["Ana", "Luis", "María"]
    assert [row["score"] for row in data] == [900, 850, 700]
    assert [row["rank"] for row in data] == [1, 2, 3]


def test_registered_leaderboard_never_exposes_email_or_ids(client):
    response = client.get("/api/games/leaderboard/cosechas/registered")

    assert "@" not in response.text
    assert "private.example" not in response.text
    for row in response.json()["data"]:
        assert "email" not in row
        assert "user_id" not in row
        assert set(row) == {
            "rank",
            "display_name",
            "country_code",
            "department_code",
            "municipality_code",
            "score",
            "difficulty",
            "created_at",
        }


def test_registered_leaderboard_filters_by_department(client):
    response = client.get("/api/games/leaderboard/cosechas/registered?department_code=76")

    names = [row["display_name"] for row in response.json()["data"]]
    assert names == ["Ana", "María"]
    assert response.json()["department_code"] == "76"


def test_registered_leaderboard_filters_by_municipality(client):
    response = client.get("/api/games/leaderboard/cosechas/registered?municipality_code=76111")

    assert [row["display_name"] for row in response.json()["data"]] == ["María"]


def test_registered_leaderboard_filters_by_difficulty_and_limit(client):
    response = client.get("/api/games/leaderboard/cosechas/registered?difficulty=basico&limit=1")

    body = response.json()
    assert body["count"] == 1
    assert body["data"][0]["display_name"] == "Luis"


@pytest.mark.parametrize(
    "query",
    ["department_code=7", "municipality_code=761", "country_code=colombia"],
)
def test_registered_leaderboard_rejects_malformed_territory_codes(client, query):
    response = client.get(f"/api/games/leaderboard/cosechas/registered?{query}")
    assert response.status_code == 422


def test_registered_leaderboard_rejects_unknown_game(client):
    response = client.get("/api/games/leaderboard/otro-juego/registered")
    assert response.status_code == 422


def test_guest_leaderboard_is_still_available(client):
    with patch.object(GameScoresRepository, "get_leaderboard", return_value=[]):
        response = client.get("/api/games/leaderboard/cosechas")

    assert response.status_code == 200
    assert response.json()["data"] == []


# ========== EXPIRED SESSION CONTRACT ==========


def test_expired_token_on_score_save_returns_401_and_saves_nothing(client):
    """La sesión caducada no degrada la partida a invitado: el backend responde 401 y no guarda."""

    async def reject(token):
        raise AuthInvalidToken("expirado")

    payload = {
        "player_id": str(uuid4()),
        "game_slug": "cosechas",
        "score": 120,
    }
    with patch.object(auth_module, "verify_access_token", reject):
        response = client.post(
            "/api/games/scores",
            headers={"Authorization": "Bearer expirado"},
            json=payload,
        )

    assert response.status_code == 401
    assert SAVED_SCORES == []


def test_retry_after_login_saves_with_the_account_user_id(client):
    """Tras iniciar sesión, el reintento guarda con el user_id del token, nunca del body."""
    account = uuid4()
    payload = {
        "player_id": str(uuid4()),
        "game_slug": "cosechas",
        "score": 120,
        "user_id": str(uuid4()),  # intento de suplantación: debe ignorarse
    }

    async def accept(token):
        return AuthUser(id=account, email=None)

    with patch.object(auth_module, "verify_access_token", accept):
        response = client.post(
            "/api/games/scores",
            headers={"Authorization": "Bearer valido"},
            json=payload,
        )

    assert response.status_code == 201
    assert SAVED_SCORES[0]["user_id"] == str(account)
