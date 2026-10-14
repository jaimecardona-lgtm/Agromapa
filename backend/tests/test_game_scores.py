"""Tests for public mini-game scores. Repository is mocked: no Supabase needed."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.game_scores import GameScoreCreate, sanitize_alias
from app.services import game_scores_service

PLAYER = str(uuid4())
CREATED = "2026-10-12T10:00:00+00:00"


def quiz_payload(**overrides):
    base = {
        "player_id": PLAYER,
        "player_alias": "Ana",
        "game_slug": "eco-puzzle",
        "difficulty": "basico",
        "score": 300,
        "correct_answers": 3,
        "wrong_answers": 2,
        "best_streak": 2,
        "lives_remaining": 1,
        "duration_seconds": 60,
        "metadata": {"rounds": 5},
    }
    base.update(overrides)
    return base


def cosechas_payload(**overrides):
    base = {
        "player_id": PLAYER,
        "player_alias": "Luis",
        "game_slug": "cosechas",
        "difficulty": None,
        "score": 240,
        "duration_seconds": 30,
        "metadata": {"crops_collected": 20, "obstacles_hit": 3, "best_combo": 6, "shields_used": 1},
    }
    base.update(overrides)
    return base


def stored_row(**overrides):
    row = {
        "id": str(uuid4()),
        "player_alias": "Ana",
        "game_slug": "eco-puzzle",
        "difficulty": "basico",
        "score": 300,
        "correct_answers": 3,
        "wrong_answers": 2,
        "best_streak": 2,
        "lives_remaining": 1,
        "duration_seconds": 60,
        "created_at": CREATED,
    }
    row.update(overrides)
    return row


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def insert_mock():
    with patch.object(game_scores_service.repository, "insert_score", new=AsyncMock(side_effect=lambda data: stored_row(**{
        "player_alias": data["player_alias"],
        "game_slug": data["game_slug"],
        "difficulty": data["difficulty"],
        "score": data["score"],
    }))) as mock:
        yield mock


# ---------- Validación de payload ----------

class TestScoreValidation:
    def test_valid_quiz_score_is_created(self, client, insert_mock):
        response = client.post("/api/games/scores", json=quiz_payload())
        assert response.status_code == 201
        assert response.json()["score"] == 300
        insert_mock.assert_awaited_once()

    def test_valid_cosechas_score_is_created_without_difficulty(self, client, insert_mock):
        response = client.post("/api/games/scores", json=cosechas_payload())
        assert response.status_code == 201
        assert insert_mock.call_args.args[0]["difficulty"] is None

    def test_invalid_game_slug_is_rejected(self, client, insert_mock):
        response = client.post("/api/games/scores", json=quiz_payload(game_slug="pacman"))
        assert response.status_code == 422
        insert_mock.assert_not_awaited()

    def test_negative_score_is_rejected(self, client, insert_mock):
        response = client.post("/api/games/scores", json=cosechas_payload(score=-1))
        assert response.status_code == 422
        insert_mock.assert_not_awaited()

    def test_invalid_difficulty_is_rejected(self, client, insert_mock):
        response = client.post("/api/games/scores", json=quiz_payload(difficulty="imposible"))
        assert response.status_code == 422

    def test_more_than_three_lives_is_rejected(self, client, insert_mock):
        response = client.post("/api/games/scores", json=quiz_payload(lives_remaining=4))
        assert response.status_code == 422

    def test_quiz_requires_difficulty(self):
        with pytest.raises(ValidationError):
            GameScoreCreate(**quiz_payload(difficulty=None))

    def test_cosechas_rejects_difficulty(self):
        with pytest.raises(ValidationError):
            GameScoreCreate(**cosechas_payload(difficulty="basico"))

    def test_quiz_rejects_more_answers_than_round(self):
        with pytest.raises(ValidationError):
            GameScoreCreate(**quiz_payload(correct_answers=5, wrong_answers=3, lives_remaining=0))

    def test_quiz_rejects_lives_inconsistent_with_errors(self):
        with pytest.raises(ValidationError):
            GameScoreCreate(**quiz_payload(wrong_answers=2, lives_remaining=3))

    def test_quiz_rejects_score_above_maximum_for_correct_answers(self):
        with pytest.raises(ValidationError):
            GameScoreCreate(**quiz_payload(correct_answers=1, wrong_answers=0, lives_remaining=3, best_streak=1, score=500))

    def test_quiz_rejects_streak_above_correct_answers(self):
        with pytest.raises(ValidationError):
            GameScoreCreate(**quiz_payload(correct_answers=1, wrong_answers=0, lives_remaining=3, best_streak=4, score=100))

    def test_metadata_rejects_nested_objects(self):
        with pytest.raises(ValidationError):
            GameScoreCreate(**quiz_payload(metadata={"nested": {"a": 1}}))

    def test_metadata_rejects_too_many_keys(self):
        with pytest.raises(ValidationError):
            GameScoreCreate(**quiz_payload(metadata={f"k{i}": i for i in range(11)}))

    def test_invalid_uuid_player_is_rejected(self, client, insert_mock):
        response = client.post("/api/games/scores", json=quiz_payload(player_id="no-es-uuid"))
        assert response.status_code == 422


# ---------- Alias ----------

class TestAlias:
    def test_alias_is_trimmed_and_stored_as_plain_text(self, client, insert_mock):
        response = client.post("/api/games/scores", json=quiz_payload(player_alias="  <b>Ana</b>   María  "))
        assert response.status_code == 201
        stored = insert_mock.call_args.args[0]["player_alias"]
        assert "<" not in stored and ">" not in stored
        assert stored == "bAna/b María"

    def test_empty_alias_becomes_default(self):
        assert sanitize_alias("   ") == "Jugador"
        assert sanitize_alias(None) == "Jugador"
        assert sanitize_alias("<>") == "Jugador"

    def test_long_alias_is_truncated(self):
        assert len(sanitize_alias("x" * 200)) == 40

    def test_control_characters_are_removed(self):
        assert sanitize_alias("Ana\x00\x07Lu") == "AnaLu"


# ---------- Leaderboard ----------

class TestLeaderboard:
    def test_returns_ranked_entries_in_repository_order(self, client):
        rows = [stored_row(score=500, player_alias="A"), stored_row(score=400, player_alias="B")]
        with patch.object(game_scores_service.repository, "get_leaderboard", new=AsyncMock(return_value=rows)) as mock:
            response = client.get("/api/games/leaderboard/eco-puzzle")
        assert response.status_code == 200
        body = response.json()
        assert [e["rank"] for e in body["data"]] == [1, 2]
        assert [e["score"] for e in body["data"]] == [500, 400]
        assert body["limit"] == 10
        mock.assert_awaited_once_with("eco-puzzle", None, 10)

    def test_difficulty_filter_is_forwarded(self, client):
        with patch.object(game_scores_service.repository, "get_leaderboard", new=AsyncMock(return_value=[])) as mock:
            response = client.get("/api/games/leaderboard/cazadores-residuos?difficulty=experto&limit=5")
        assert response.status_code == 200
        mock.assert_awaited_once_with("cazadores-residuos", "experto", 5)

    def test_invalid_difficulty_filter_is_rejected(self, client):
        response = client.get("/api/games/leaderboard/eco-puzzle?difficulty=facil")
        assert response.status_code == 422

    def test_limit_above_maximum_is_rejected(self, client):
        response = client.get("/api/games/leaderboard/eco-puzzle?limit=51")
        assert response.status_code == 422

    def test_limit_below_minimum_is_rejected(self, client):
        response = client.get("/api/games/leaderboard/eco-puzzle?limit=0")
        assert response.status_code == 422

    def test_invalid_slug_is_rejected(self, client):
        response = client.get("/api/games/leaderboard/otro-juego")
        assert response.status_code == 422

    def test_service_clamps_limit_to_maximum(self):
        import asyncio

        with patch.object(game_scores_service.repository, "get_leaderboard", new=AsyncMock(return_value=[])) as mock:
            result = asyncio.run(game_scores_service.get_leaderboard("cosechas", None, 500))
        assert result.limit == 50
        mock.assert_awaited_once_with("cosechas", None, 50)


# ---------- Mejor puntaje e historial del jugador ----------

class TestPlayerBest:
    def test_best_score_per_game(self, client):
        rows = [
            {"game_slug": "cosechas", "difficulty": None, "score": 320, "created_at": CREATED},
            {"game_slug": "eco-puzzle", "difficulty": "experto", "score": 280, "created_at": CREATED},
            {"game_slug": "cosechas", "difficulty": None, "score": 100, "created_at": CREATED},
        ]
        with patch.object(game_scores_service.repository, "get_player_best_candidates", new=AsyncMock(return_value=rows)):
            response = client.get(f"/api/games/player/{PLAYER}/best")
        assert response.status_code == 200
        best = response.json()["best"]
        assert best["cosechas"]["score"] == 320
        assert best["eco-puzzle"]["difficulty"] == "experto"
        assert "cazadores-residuos" not in best

    def test_invalid_player_uuid_is_rejected(self, client):
        response = client.get("/api/games/player/no-uuid/best")
        assert response.status_code == 422


class TestPlayerHistory:
    def test_history_returns_recent_scores(self, client):
        rows = [stored_row(), stored_row(score=100)]
        with patch.object(game_scores_service.repository, "get_player_scores", new=AsyncMock(return_value=rows)) as mock:
            response = client.get(f"/api/games/player/{PLAYER}/history")
        assert response.status_code == 200
        assert response.json()["count"] == 2
        player_arg, limit_arg = mock.call_args.args
        assert str(player_arg) == PLAYER
        assert limit_arg == 20

    def test_history_limit_above_twenty_is_rejected(self, client):
        response = client.get(f"/api/games/player/{PLAYER}/history?limit=21")
        assert response.status_code == 422


# ---------- Errores de almacenamiento ----------

class TestStorageErrors:
    def test_storage_failure_returns_generic_503(self, client):
        failing = AsyncMock(side_effect=RuntimeError("Supabase is not configured: secret detail"))
        with patch.object(game_scores_service.repository, "insert_score", new=failing):
            response = client.post("/api/games/scores", json=cosechas_payload())
        assert response.status_code == 503
        body = response.text
        assert "secret detail" not in body
        assert "no está disponible" in body
