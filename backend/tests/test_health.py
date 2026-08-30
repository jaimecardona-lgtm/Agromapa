import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200

    data = response.json()
    assert "status" in data
    assert "service" in data
    assert "environment" in data
    assert "version" in data
    assert "database" in data


def test_health_status_ok(client):
    response = client.get("/api/health")
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "agromapa-api"


def test_health_database_not_configured(client):
    response = client.get("/api/health")
    data = response.json()
    assert data["database"]["status"] in ["connected", "disconnected", "not_configured"]
