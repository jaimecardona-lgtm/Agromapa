"""
Synchronization job for UPRA geographic reference.

Fetches departments and municipalities from UPRA ArcGIS REST service
and stores them in Supabase with real geometries.

Usage:
    python -m app.jobs.sync_upra_geo
"""

import asyncio
import logging
import sys

from app.integrations.upra_geo_client import UPRAGeoClient
from app.repositories.data_source_repository import DataSourceRepository
from app.repositories.geo_repository import GeoRepository
from app.repositories.sync_repository import SyncRepository
from app.services.supabase_service import supabase_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

data_source_repo = DataSourceRepository()
geo_repo = GeoRepository()
sync_repo = SyncRepository()


async def sync_upra_geo():
    """Synchronize UPRA geographic data."""

    if not supabase_service.is_configured():
        logger.error("Supabase not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY")
        return False

    try:
        # Get data source UUID
        data_source = await data_source_repo.get_by_key("upra_geo")
        if not data_source:
            logger.error("Data source 'upra_geo' not found in database")
            return False

        source_id = data_source["id"]
        logger.info(f"Using source_id: {source_id}")

        client = UPRAGeoClient()

        # Create sync run with UUID
        sync_run = await sync_repo.create_sync_run(
            source_id=source_id,
            sync_type="geo_units",
        )
        sync_run_id = sync_run.get("id")

        total_processed = 0
        total_created = 0
        total_updated = 0
        errors_count = 0

        # Fetch and store departments
        logger.info("Fetching departments from UPRA...")
        try:
            departments = await client.get_departments()
            logger.info(f"Got {len(departments)} departments")

            # Build department lookup by dane_code
            department_by_dane = {}

            for dept in departments:
                try:
                    result = await geo_repo.upsert_geo_unit(
                        level="department",
                        dane_code=dept.dane_code,
                        name=dept.name,
                        geojson_geometry=dept.geojson,
                        source_id=source_id,
                    )
                    department_by_dane[dept.dane_code] = result
                    total_processed += 1
                    total_created += 1
                except Exception as e:
                    logger.error(f"Failed to insert department {dept.dane_code}: {e}")
                    errors_count += 1

        except Exception as e:
            logger.error(f"Failed to fetch departments: {e}")
            errors_count += 1

        logger.info(f"Department lookup built: {len(department_by_dane)} departments")

        # Fetch municipalities
        logger.info("Fetching municipalities from UPRA...")
        try:
            municipalities = await client.get_municipalities()
            logger.info(f"Got {len(municipalities)} municipalities")

            for mun in municipalities:
                try:
                    # Get parent_id from department
                    parent_id = None
                    if mun.department_dane_code and mun.department_dane_code in department_by_dane:
                        parent_geo = department_by_dane[mun.department_dane_code]
                        parent_id = parent_geo.get("id")

                    await geo_repo.upsert_geo_unit(
                        level="municipality",
                        dane_code=mun.dane_code,
                        name=mun.name,
                        geojson_geometry=mun.geojson,
                        parent_id=parent_id,
                        source_id=source_id,
                    )
                    total_processed += 1
                    total_created += 1
                except Exception as e:
                    logger.error(f"Failed to insert municipality {mun.dane_code}: {e}")
                    errors_count += 1

        except Exception as e:
            logger.error(f"Failed to fetch municipalities: {e}")
            errors_count += 1

        # Update sync run
        await sync_repo.update_sync_run(
            sync_run_id=sync_run_id,
            status="success" if errors_count == 0 else "failed",
            records_processed=total_processed,
            records_created=total_created,
            records_updated=total_updated,
            errors_count=errors_count,
        )

        logger.info(
            f"Sync completed: processed={total_processed}, created={total_created}, "
            f"errors={errors_count}"
        )

        return errors_count == 0

    except Exception as e:
        logger.error(f"Sync failed: {e}")
        return False


if __name__ == "__main__":
    success = asyncio.run(sync_upra_geo())
    sys.exit(0 if success else 1)
