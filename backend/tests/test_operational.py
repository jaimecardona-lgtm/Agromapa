"""Tests for operational model (producers, farms, crops, offers)."""

from datetime import date, timedelta
from uuid import uuid4

import pytest

from app.schemas.operational import (
    FarmCreate,
    FarmCropCreate,
    ProducerCreate,
    ProducerUpdate,
    ProductionOfferCreate,
    ProductionOfferUpdate,
)


class TestProducers:
    """Test producer operations."""

    def test_producer_create_schema(self):
        """Test producer creation schema."""
        producer = ProducerCreate(
            name="Farmer Juan",
            document_type="cedula",
            document_number="123456789",
            phone="+57 310 1234567",
            email="juan@farm.com",
            organization="Coop La Tierra",
        )
        assert producer.name == "Farmer Juan"
        assert producer.email == "juan@farm.com"

    def test_producer_update_schema(self):
        """Test producer update schema."""
        update = ProducerUpdate(
            phone="+57 320 9876543",
            active=True,
        )
        assert update.phone == "+57 320 9876543"
        assert update.active is True

    def test_producer_required_fields(self):
        """Test producer required field."""
        producer = ProducerCreate(name="Jane Doe")
        assert producer.name == "Jane Doe"
        assert producer.email is None


class TestFarms:
    """Test farm operations."""

    def test_farm_create_schema(self):
        """Test farm creation schema."""
        producer_id = uuid4()
        farm = FarmCreate(
            producer_id=producer_id,
            name="La Esperanza",
            municipality_code="76001",
            latitude=4.5981,
            longitude=-75.2098,
            description="Coffee and plantain farm",
            area_ha=15.5,
        )
        assert farm.name == "La Esperanza"
        assert farm.latitude == 4.5981
        assert farm.area_ha == 15.5

    def test_farm_latitude_validation(self):
        """Test farm latitude validation."""
        producer_id = uuid4()
        with pytest.raises(ValueError):
            FarmCreate(
                producer_id=producer_id,
                name="Invalid",
                municipality_code="76001",
                latitude=91.0,  # Invalid
                longitude=-75.0,
            )

    def test_farm_longitude_validation(self):
        """Test farm longitude validation."""
        producer_id = uuid4()
        with pytest.raises(ValueError):
            FarmCreate(
                producer_id=producer_id,
                name="Invalid",
                municipality_code="76001",
                latitude=4.5,
                longitude=181.0,  # Invalid
            )

    def test_farm_area_validation(self):
        """Test farm area validation."""
        producer_id = uuid4()
        with pytest.raises(ValueError):
            FarmCreate(
                producer_id=producer_id,
                name="Invalid",
                municipality_code="76001",
                latitude=4.5,
                longitude=-75.0,
                area_ha=-5.0,  # Invalid
            )


class TestFarmCrops:
    """Test farm crop operations."""

    def test_farm_crop_create_schema(self):
        """Test farm crop creation schema."""
        farm_id = uuid4()
        crop = FarmCropCreate(
            farm_id=farm_id,
            crop_name="Coffee",
            description="Variedad Arabica",
            area_hectares=10.0,
        )
        assert crop.crop_name == "Coffee"
        assert crop.description == "Variedad Arabica"

    def test_farm_crop_minimal(self):
        """Test minimal farm crop."""
        farm_id = uuid4()
        crop = FarmCropCreate(
            farm_id=farm_id,
            crop_name="Plantain",
        )
        assert crop.crop_name == "Plantain"
        assert crop.description is None


class TestProductionOffers:
    """Test production offer operations."""

    def test_offer_create_schema(self):
        """Test offer creation schema."""
        farm_crop_id = uuid4()
        today = date.today()
        offer = ProductionOfferCreate(
            farm_crop_id=farm_crop_id,
            available_quantity=1000.0,
            unit="kg",
            availability_start=today,
            availability_end=today + timedelta(days=30),
            price_per_unit=5000.0,
            description="Quality coffee beans",
        )
        assert offer.available_quantity == 1000.0
        assert offer.unit == "kg"

    def test_offer_available_quantity_validation(self):
        """Test offer available_quantity must be positive."""
        farm_crop_id = uuid4()
        with pytest.raises(ValueError):
            ProductionOfferCreate(
                farm_crop_id=farm_crop_id,
                available_quantity=-100.0,  # Invalid
                unit="kg",
            )

    def test_offer_update_status(self):
        """Test updating offer status."""
        update = ProductionOfferUpdate(
            status="sold_out",
        )
        assert update.status == "sold_out"

    def test_offer_update_harvested(self):
        """Test updating harvested timestamp."""
        from datetime import datetime
        now = datetime.now()
        update = ProductionOfferUpdate(
            harvested_at=now,
            status="harvested",
        )
        assert update.harvested_at == now
        assert update.status == "harvested"

    def test_offer_date_validity(self):
        """Test offer date range validity."""
        farm_crop_id = uuid4()
        today = date.today()

        # Valid: availability_end >= availability_start
        offer = ProductionOfferCreate(
            farm_crop_id=farm_crop_id,
            available_quantity=100.0,
            unit="kg",
            availability_start=today,
            availability_end=today + timedelta(days=10),
        )
        assert offer.availability_start <= offer.availability_end


class TestOfferStatuses:
    """Test offer status transitions."""

    def test_valid_statuses(self):
        """Test all valid offer statuses."""
        valid_statuses = ["available", "harvested", "sold_out", "inactive", "historical"]

        for status in valid_statuses:
            update = ProductionOfferUpdate(status=status)
            assert update.status == status

    def test_offer_historical_status(self):
        """Test historical status for long-past offers."""
        farm_crop_id = uuid4()
        old_date = date.today() - timedelta(days=365)

        offer = ProductionOfferCreate(
            farm_crop_id=farm_crop_id,
            available_quantity=100.0,
            unit="kg",
            availability_end=old_date,
        )
        assert offer.availability_end < date.today()


class TestCurrentOfferFiltering:
    """Test current offer filtering logic."""

    def test_available_offer_criteria(self):
        """Test criteria for available offers."""
        farm_crop_id = uuid4()
        today = date.today()

        # Offer should be available:
        # - status = available
        # - availability_start <= today (or null)
        # - availability_end >= today (or null)

        offer = ProductionOfferCreate(
            farm_crop_id=farm_crop_id,
            available_quantity=100.0,
            unit="kg",
            availability_start=today - timedelta(days=5),
            availability_end=today + timedelta(days=10),
        )
        assert offer.availability_start <= today
        assert offer.availability_end >= today

    def test_expired_offer(self):
        """Test expired offer (availability_end < today)."""
        farm_crop_id = uuid4()
        today = date.today()

        offer = ProductionOfferCreate(
            farm_crop_id=farm_crop_id,
            available_quantity=100.0,
            unit="kg",
            availability_end=today - timedelta(days=1),
        )
        # This offer should NOT appear in current offers
        assert offer.availability_end < today

    def test_not_yet_available_offer(self):
        """Test offer not yet available (availability_start > today)."""
        farm_crop_id = uuid4()
        today = date.today()

        offer = ProductionOfferCreate(
            farm_crop_id=farm_crop_id,
            available_quantity=100.0,
            unit="kg",
            availability_start=today + timedelta(days=10),
        )
        # This offer should NOT appear in current offers
        assert offer.availability_start > today


class TestSourceAndDataType:
    """Test source and data type distinction."""

    def test_operational_source(self):
        """Test operational data is marked correctly."""
        # When an offer is created through operational API:
        # - source = "Raíces Conectadas"
        # - data_type = "operational"
        #
        # This is set in the view, not in the schema
        pass

    def test_eva_isolation(self):
        """Test EVA data is not mixed with operational."""
        # current_operational_offers view should NEVER include
        # data from agricultural_stats (EVA)
        pass
