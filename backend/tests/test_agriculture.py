"""Tests for agriculture API and schemas."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.agriculture_service import get_municipality_agriculture


@pytest.fixture
def client():
    return TestClient(app)


def test_agriculture_endpoint_not_found(client):
    """Test getting stats for non-existent municipality."""
    with patch("app.routers.agriculture.get_municipality_agriculture", new_callable=AsyncMock) as mock_service:
        mock_service.return_value = None
        response = client.get("/api/agriculture/municipalities/99999?year=2024")
        assert response.status_code == 200
        data = response.json()
        assert data["data"] is None
        assert "No agricultural data found" in data["message"]


@pytest.mark.asyncio
async def test_agriculture_service_calculations():
    """Test agriculture service accurately preserves fields and calculates aggregate yield correctly."""
    mock_geo = {
        "id": "mun-1",
        "name": "Calamar",
        "dane_code": "95015",
    }
    mock_stats = [
        {
            "crop_code": "101",
            "crop_name": "Maíz",
            "crop_group": "Cereales",
            "crop_subgroup": "Maíz",
            "crop_cycle": "Transitorio",
            "crop_disaggregation": "Maíz tecnificado",
            "period": "2024A",
            "crop_physical_state": "Grano seco",
            "crop_scientific_name": "Zea mays",
            "area_planted_ha": 100.0,
            "area_harvested_ha": 80.0,
            "production_tons": 240.0,
            "yield_t_ha": 3.0,
        },
        {
            "crop_code": "101",
            "crop_name": "Maíz",
            "crop_group": "Cereales",
            "crop_subgroup": "Maíz",
            "crop_cycle": "Transitorio",
            "crop_disaggregation": "Maíz tradicional",
            "period": "2024B",
            "crop_physical_state": "Grano seco",
            "crop_scientific_name": "Zea mays",
            "area_planted_ha": 50.0,
            "area_harvested_ha": 40.0,
            "production_tons": 80.0,
            "yield_t_ha": 2.0,
        },
    ]

    with patch("app.services.agriculture_service.geo_repo.get_by_dane_code", new_callable=AsyncMock) as mock_get_geo, \
         patch("app.services.agriculture_service.ag_repo.get_by_municipality_and_year", new_callable=AsyncMock) as mock_get_stats:
        mock_get_geo.return_value = mock_geo
        mock_get_stats.return_value = mock_stats

        result = await get_municipality_agriculture("95015", 2024)

        assert result is not None
        assert result["municipality"]["dane_code"] == "95015"
        assert result["municipality"]["name"] == "Calamar"
        assert len(result["crops"]) == 2

        # Check total area and production
        assert result["total_area_planted_ha"] == 150.0
        assert result["total_area_harvested_ha"] == 120.0
        assert result["total_production_tons"] == 320.0

        # Yield MUST NOT be sum(yield_t_ha) = 5.0!
        # Yield MUST be production / harvested = 320.0 / 120.0 = 2.67
        assert result["average_yield_t_ha"] == round(320.0 / 120.0, 2)
        assert result["average_yield_t_ha"] == 2.67

        # Verify crop dimensions preserved
        c1 = result["crops"][0]
        assert c1["crop_code"] == "101"
        assert c1["period"] == "2024A"
        assert c1["crop_disaggregation"] == "Maíz tecnificado"
