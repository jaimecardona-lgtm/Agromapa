"""Rankings de juegos: mejor puntaje, suma general, empates, territorio, privacidad y validación de puntajes.

Sin Supabase real: el repositorio se reemplaza por dobles en memoria o por un cliente falso que
implementa la cadena de consulta usada (select/eq/in_/order/range), para probar la paginación.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.repositories import game_scores_repository as repo_module
from app.repositories.game_scores_repository import GameScoresRepository
from app.schemas.game_scores import GameScoreCreate
from app.services import rankings_service as svc

BASE_TIME = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)
YOTOCO = "76890"
VALLE = "76"
BOGOTA_DEPT = "11"
BOGOTA = "11001"

USERS = {
    "ana": {"id": "00000000-0000-4000-8000-00000000000a", "display_name": "Ana", "department_code": VALLE, "municipality_code": YOTOCO},
    "beto": {"id": "00000000-0000-4000-8000-00000000000b", "display_name": "Beto", "department_code": VALLE, "municipality_code": YOTOCO},
    "carla": {"id": "00000000-0000-4000-8000-00000000000c", "display_name": "Carla", "department_code": BOGOTA_DEPT, "municipality_code": BOGOTA},
    "sin_territorio": {"id": "00000000-0000-4000-8000-00000000000d", "display_name": "Diego", "department_code": None, "municipality_code": None},
    "email_como_nombre": {"id": "00000000-0000-4000-8000-00000000000e", "display_name": "eva@example.com", "department_code": VALLE, "municipality_code": YOTOCO},
    "sin_scores": {"id": "00000000-0000-4000-8000-00000000000f", "display_name": "Fer", "department_code": VALLE, "municipality_code": YOTOCO},
}
GEO = {
    ("department", VALLE): {"name": "Valle del Cauca", "dane_code": VALLE},
    ("department", BOGOTA_DEPT): {"name": "Bogotá", "dane_code": BOGOTA_DEPT},
    ("municipality", YOTOCO): {"name": "Yotoco", "dane_code": YOTOCO},
    ("municipality", BOGOTA): {"name": "Bogotá", "dane_code": BOGOTA},
}


def _score(user, game, value, minutes=0):
    return {
        "id": f"s-{user}-{game}-{value}-{minutes}",
        "user_id": USERS[user]["id"],
        "game_slug": game,
        "score": value,
        "difficulty": None if game == "cosechas" else "basico",
        "created_at": (BASE_TIME + timedelta(minutes=minutes)).isoformat(),
    }


class FakeRepo:
    def __init__(self, scores):
        self.scores = scores
        self.score_calls = 0
        self.profile_calls = 0

    async def list_registered_scores(self, game_slug, user_ids=None):
        self.score_calls += 1
        rows = [r for r in self.scores if r["game_slug"] == game_slug]
        if user_ids is not None:
            rows = [r for r in rows if r["user_id"] in set(user_ids)]
        return rows

    async def list_territory_profiles(self, department_code=None, municipality_code=None):
        self.profile_calls += 1
        rows = []
        for user in USERS.values():
            if department_code and user["department_code"] != department_code:
                continue
            if municipality_code and user["municipality_code"] != municipality_code:
                continue
            rows.append({"id": user["id"]})
        return rows

    async def get_profiles_by_ids(self, user_ids):
        return {u["id"]: u for u in USERS.values() if u["id"] in set(user_ids)}


class FakeGeo:
    async def get_by_dane_code(self, level, code):
        return GEO.get((level, code))


@pytest.fixture
def scores_world(monkeypatch):
    """Puntajes: Ana 770 (tres partidas de Cosechas, no se suman); Beto 770 (empate); Carla 900."""
    scores = [
        _score("ana", "cosechas", 500, 1),
        _score("ana", "cosechas", 770, 2),
        _score("ana", "cosechas", 600, 3),
        _score("ana", "eco-puzzle", 900, 4),
        _score("ana", "cazadores-residuos", 820, 5),
        _score("beto", "cosechas", 770, 6),
        _score("carla", "cosechas", 900, 7),
        _score("email_como_nombre", "cosechas", 400, 8),
    ]
    repo = FakeRepo(scores)
    monkeypatch.setattr(svc, "repository", repo)
    monkeypatch.setattr(svc, "geo_repo", FakeGeo())
    return repo


# ---------- funciones puras ----------


def test_best_by_user_keeps_best_not_sum():
    rows = [_score("ana", "cosechas", 500, 1), _score("ana", "cosechas", 770, 2), _score("ana", "cosechas", 600, 3)]
    best = svc.best_by_user(rows)
    assert best[USERS["ana"]["id"]]["score"] == 770


def test_general_is_sum_of_best_per_game_only():
    per_game = {
        "cosechas": svc.best_by_user([_score("ana", "cosechas", 770)]),
        "eco-puzzle": svc.best_by_user([_score("ana", "eco-puzzle", 900, 1), _score("ana", "eco-puzzle", 300, 2)]),
        "cazadores-residuos": svc.best_by_user([_score("ana", "cazadores-residuos", 820)]),
    }
    assert svc.general_totals(per_game)[USERS["ana"]["id"]] == 770 + 900 + 820 == 2490


def test_ties_share_the_same_position_and_skip_the_next():
    assert svc.competition_ranks({"a": 900, "b": 770, "c": 770, "d": 500}) == {"a": 1, "b": 2, "c": 2, "d": 4}


def test_public_display_name_never_falls_back_to_email():
    assert svc.public_display_name("eva@example.com") == "Jugador"
    assert svc.public_display_name("   ") == "Jugador"
    assert svc.public_display_name(None) == "Jugador"
    assert svc.public_display_name("Ana") == "Ana"


# ---------- ranking por alcance ----------


async def test_national_general_ranking_orders_by_sum_and_shares_ties(scores_world):
    response = await svc.get_ranking(scope="national", game="general")

    names = [(e.rank, e.display_name, e.score) for e in response.entries]
    assert names[0] == (1, "Ana", 2490)
    assert [entry.score for entry in response.entries][:2] == [2490, 900]
    assert ("Carla" in [e.display_name for e in response.entries])


async def test_single_game_ranking_shows_tie_at_the_same_rank(scores_world):
    response = await svc.get_ranking(scope="national", game="cosechas")

    cosechas = {entry.display_name: entry for entry in response.entries}
    assert cosechas["Carla"].rank == 1
    assert cosechas["Ana"].rank == 2
    assert cosechas["Beto"].rank == 2
    assert response.game == "cosechas"


async def test_department_scope_only_includes_its_population(scores_world):
    response = await svc.get_ranking(scope="department", game="general", department_code=VALLE)

    names = [entry.display_name for entry in response.entries]
    assert "Carla" not in names
    assert names[0] == "Ana"
    assert response.territory.department_name == "Valle del Cauca"


async def test_municipality_scope_resolves_names_and_excludes_others(scores_world):
    response = await svc.get_ranking(scope="municipality", game="cosechas", municipality_code=YOTOCO)

    assert {entry.display_name for entry in response.entries} == {"Ana", "Beto", "Jugador"}
    assert response.territory.municipality_name == "Yotoco"


async def test_scope_requires_its_territory_code(scores_world):
    with pytest.raises(svc.RankingRequestError) as department:
        await svc.get_ranking(scope="department", game="general")
    assert department.value.status_code == 422

    with pytest.raises(svc.RankingRequestError) as municipality:
        await svc.get_ranking(scope="municipality", game="general")
    assert municipality.value.status_code == 422


async def test_unknown_territory_is_404_not_an_empty_ranking(scores_world):
    with pytest.raises(svc.RankingRequestError) as info:
        await svc.get_ranking(scope="municipality", game="general", municipality_code="99999")
    assert info.value.status_code == 404


async def test_empty_population_gives_a_valid_empty_structure(scores_world, monkeypatch):
    monkeypatch.setattr(svc, "repository", FakeRepo([]))
    response = await svc.get_ranking(scope="municipality", game="general", municipality_code=YOTOCO)

    assert response.count == 0
    assert response.entries == []


async def test_viewer_row_is_marked_without_exposing_its_id(scores_world):
    response = await svc.get_ranking(
        scope="national", game="cosechas", viewer_user_id=UUID(USERS["beto"]["id"])
    )

    marked = [entry for entry in response.entries if entry.is_me]
    assert [entry.display_name for entry in marked] == ["Beto"]
    assert USERS["beto"]["id"] not in response.model_dump_json()


async def test_email_as_display_name_is_replaced_in_the_ranking(scores_world):
    response = await svc.get_ranking(scope="national", game="cosechas")

    text = response.model_dump_json()
    assert "eva@example.com" not in text
    assert "@" not in text


async def test_ranking_response_never_contains_user_ids_or_contact(scores_world):
    response = await svc.get_ranking(scope="national", game="general")

    text = response.model_dump_json()
    for user in USERS.values():
        assert user["id"] not in text
    for forbidden in ("user_id", "email", "phone", "contact"):
        assert forbidden not in text


# ---------- /api/me/ranking ----------


async def test_my_ranking_reports_best_general_and_positions(scores_world):
    profile = USERS["ana"]
    response = await svc.get_my_ranking(UUID(profile["id"]), profile)

    assert response.has_scores is True
    assert response.best == {"cosechas": 770, "eco-puzzle": 900, "cazadores-residuos": 820}
    assert response.general == 2490
    assert response.positions["national"].rank == 1
    assert response.positions["municipality"].rank == 1
    assert response.positions["municipality"].of == 3
    assert response.territory.municipality_name == "Yotoco"
    assert response.missing_territory == []


async def test_my_ranking_user_without_territory_gets_no_invented_positions(scores_world):
    profile = USERS["sin_territorio"]
    scores_world.scores.append(_score("sin_territorio", "cosechas", 300, 9))
    response = await svc.get_my_ranking(UUID(profile["id"]), profile)

    assert response.positions["department"] is None
    assert response.positions["municipality"] is None
    assert sorted(response.missing_territory) == ["department", "municipality"]
    assert response.positions["national"] is not None


async def test_my_ranking_without_scores_is_a_valid_empty_state(scores_world):
    profile = USERS["sin_scores"]
    response = await svc.get_my_ranking(UUID(profile["id"]), profile)

    assert response.has_scores is False
    assert response.general is None
    assert response.best == {"cosechas": None, "eco-puzzle": None, "cazadores-residuos": None}
    assert response.positions == {"national": None, "department": None, "municipality": None}


async def test_my_ranking_reads_each_game_once_not_per_player(scores_world):
    profile = USERS["ana"]
    await svc.get_my_ranking(UUID(profile["id"]), profile)

    assert scores_world.score_calls == 3  # un lote por juego, sin N+1
    assert scores_world.profile_calls == 2  # departamento y municipio


def test_my_ranking_requires_a_session(monkeypatch):
    client = TestClient(app)
    response = client.get("/api/me/ranking")
    assert response.status_code == 401


def test_public_rankings_endpoint_rejects_invalid_game_and_code():
    client = TestClient(app)
    assert client.get("/api/rankings?game=juego-falso").status_code == 422
    assert client.get("/api/rankings?scope=municipality&municipality_code=12").status_code == 422
    assert client.get("/api/rankings?limit=0").status_code == 422


# ---------- repositorio: paginación sin tope ----------


class _Not:
    def __init__(self, query):
        self.query = query

    def is_(self, column, value):
        self.query.rows = [row for row in self.query.rows if row.get(column) is not None]
        return self.query


class FakeQuery:
    def __init__(self, rows, calls):
        self.rows = list(rows)
        self.calls = calls
        self.not_ = _Not(self)

    def select(self, columns):
        return self

    def eq(self, column, value):
        self.rows = [row for row in self.rows if str(row.get(column)) == str(value)]
        return self

    def in_(self, column, values):
        allowed = {str(v) for v in values}
        self.rows = [row for row in self.rows if str(row.get(column)) in allowed]
        return self

    def order(self, column, desc=False):
        self.rows.sort(key=lambda row: str(row.get(column)))
        return self

    def range(self, start, end):
        self.rows = self.rows[start : end + 1]
        return self

    def execute(self):
        self.calls.append(1)
        return SimpleNamespace(data=self.rows)


class FakeClient:
    def __init__(self, tables):
        self.tables = tables
        self.calls = []

    def table(self, name):
        return FakeQuery(self.tables[name], self.calls)


@pytest.fixture
def fake_db(monkeypatch):
    rows = [
        {"id": f"row-{i:05d}", "user_id": f"user-{i % 40:03d}", "game_slug": "cosechas", "score": i % 900, "difficulty": None, "created_at": "2026-10-20T00:00:00+00:00"}
        for i in range(2500)
    ]
    client = FakeClient({"game_scores": rows, "profiles": []})
    monkeypatch.setattr(GameScoresRepository, "_client", lambda self: client)
    return client


async def test_repository_reads_every_registered_row_without_a_cap(fake_db):
    rows = await GameScoresRepository().list_registered_scores("cosechas")

    assert len(rows) == 2500
    assert len({row["id"] for row in rows}) == 2500
    assert len(fake_db.calls) == 3  # 1000 + 1000 + 500 en páginas


async def test_repository_batches_user_filters(fake_db):
    user_ids = [f"user-{i:03d}" for i in range(40)]
    rows = await GameScoresRepository().list_registered_scores("cosechas", user_ids)

    assert len(rows) == 2500
    assert all(row["user_id"] in set(user_ids) for row in rows)


def test_page_and_batch_constants_are_bounded():
    assert repo_module.RANKING_PAGE_SIZE == 1000
    assert repo_module.RANKING_USER_BATCH_SIZE == 200


# ---------- validación de puntajes ----------


def _payload(**overrides):
    base = {"player_id": "00000000-0000-4000-8000-0000000000aa", "game_slug": "cosechas", "score": 770}
    base.update(overrides)
    return base


def test_negative_score_is_rejected():
    with pytest.raises(ValidationError):
        GameScoreCreate(**_payload(score=-1))


def test_absurd_cosechas_score_is_rejected():
    with pytest.raises(ValidationError):
        GameScoreCreate(**_payload(score=999999))


def test_quiz_score_above_possible_maximum_is_rejected():
    with pytest.raises(ValidationError):
        GameScoreCreate(
            **_payload(
                game_slug="eco-puzzle",
                difficulty="basico",
                score=5000,
                correct_answers=2,
                wrong_answers=0,
                best_streak=2,
                lives_remaining=3,
            )
        )


def test_unknown_game_is_rejected():
    with pytest.raises(ValidationError):
        GameScoreCreate(**_payload(game_slug="juego-inventado"))


def test_valid_cosechas_score_is_accepted():
    assert GameScoreCreate(**_payload(score=770)).score == 770
