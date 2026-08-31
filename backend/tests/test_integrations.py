"""Tests for integration clients."""

import pytest
from app.integrations.upra_geo_client import UPRAGeoClient


class TestUPRAGeoClient:
    """Test UPRA Geo client functionality."""

    @pytest.mark.asyncio
    async def test_get_layer_metadata(self):
        """Test fetching layer metadata to find objectIdField."""
        client = UPRAGeoClient()
        metadata = await client._get_layer_metadata(8)
        assert metadata
        assert "objectIdField" in metadata or "objectIdField" in str(metadata).upper()

    @pytest.mark.asyncio
    async def test_get_object_ids(self):
        """Test querying only object IDs."""
        client = UPRAGeoClient()
        object_ids = await client._get_object_ids(8)
        assert isinstance(object_ids, list)
        assert len(object_ids) > 0
        assert all(isinstance(oid, int) for oid in object_ids)

    @pytest.mark.asyncio
    async def test_get_municipalities_batching(self):
        """Test municipality batching with actual UPRA service."""
        client = UPRAGeoClient()
        municipalities = await client.get_municipalities()
        assert len(municipalities) > 0
        assert all(m.dane_code for m in municipalities)
        assert all(m.name for m in municipalities)
        assert all(m.geojson for m in municipalities)

    @pytest.mark.asyncio
    async def test_get_departments(self):
        """Test department fetching."""
        client = UPRAGeoClient()
        departments = await client.get_departments()
        assert len(departments) > 0
        assert all(d.dane_code for d in departments)
        assert all(d.name for d in departments)
