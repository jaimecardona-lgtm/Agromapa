"""Tests for repository layer."""

import pytest

from app.repositories.data_source_repository import DataSourceRepository
from app.repositories.geo_repository import GeoRepository


class TestDataSourceRepository:
    """Test data source repository."""

    @pytest.mark.asyncio
    async def test_get_by_key_upra_geo(self):
        """Test resolving upra_geo source key to UUID."""
        repo = DataSourceRepository()
        data_source = await repo.get_by_key("upra_geo")
        assert data_source is not None
        assert "id" in data_source
        assert data_source["source_key"] == "upra_geo"
        assert len(data_source["id"]) == 36  # UUID length

    @pytest.mark.asyncio
    async def test_get_by_key_upra_eva(self):
        """Test resolving upra_eva source key to UUID."""
        repo = DataSourceRepository()
        data_source = await repo.get_by_key("upra_eva")
        assert data_source is not None
        assert "id" in data_source
        assert data_source["source_key"] == "upra_eva"

    @pytest.mark.asyncio
    async def test_get_by_key_nonexistent(self):
        """Test behavior for nonexistent source key."""
        repo = DataSourceRepository()
        data_source = await repo.get_by_key("nonexistent_source")
        assert data_source is None


class TestGeoRepository:
    """Test geographic repository."""

    @pytest.mark.asyncio
    async def test_get_by_dane_code_returns_none_safely(self):
        """Test that missing geo unit returns None, not 406."""
        repo = GeoRepository()
        result = await repo.get_by_dane_code("municipality", "99999")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_all_by_level_municipalities(self):
        """Test bulk loading all municipalities."""
        repo = GeoRepository()
        municipalities = await repo.get_all_by_level("municipality")
        assert isinstance(municipalities, list)
        if municipalities:
            assert all("id" in m for m in municipalities)
            assert all("dane_code" in m for m in municipalities)

    @pytest.mark.asyncio
    async def test_get_all_by_level_municipalities_with_geometry(self):
        """Test bulk loading municipalities with GeoJSON geometry."""
        repo = GeoRepository()
        municipalities = await repo.get_all_by_level("municipality", include_geometry=True)
        assert isinstance(municipalities, list)
        if municipalities:
            assert all("id" in m for m in municipalities)
            assert all("geojson" in m for m in municipalities)

    @pytest.mark.asyncio
    async def test_get_departments(self):
        """Test getting departments with geometry."""
        repo = GeoRepository()
        departments = await repo.get_departments()
        assert isinstance(departments, list)
        if departments:
            assert all("id" in d for d in departments)
            assert all("geojson" in d for d in departments)

    @pytest.mark.asyncio
    async def test_get_municipalities_by_department_valle(self):
        """Test getting municipalities for Valle del Cauca (code 76)."""
        repo = GeoRepository()
        municipalities = await repo.get_municipalities_by_department("76")
        assert isinstance(municipalities, list)
        # Valle del Cauca should have municipalities
        if municipalities:
            assert all("parent_id" in m for m in municipalities)
            assert all("geojson" in m for m in municipalities)

    @pytest.mark.asyncio
    async def test_get_all_by_level_departments(self):
        """Test bulk loading all departments."""
        repo = GeoRepository()
        departments = await repo.get_all_by_level("department")
        assert isinstance(departments, list)
