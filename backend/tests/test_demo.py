import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_get_map_points(client):
    response = client.get("/api/demo/map-points")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_map_points_structure(client):
    response = client.get("/api/demo/map-points")
    data = response.json()

    for point in data:
        assert "id" in point
        assert "municipality" in point
        assert "latitude" in point
        assert "longitude" in point
        assert "crop" in point
        assert "available_kg" in point
        assert "demo" in point
        assert point["demo"] is True


def test_map_points_coordinates_valid(client):
    response = client.get("/api/demo/map-points")
    data = response.json()

    for point in data:
        assert isinstance(point["latitude"], float)
        assert isinstance(point["longitude"], float)
        assert 3 < point["latitude"] < 5
        assert -77 < point["longitude"] < -75
