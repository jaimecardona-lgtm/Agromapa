"""
Synchronization job for EVA agricultural statistics.

Fetches evaluation data from UPRA EVA Socrata API and stores it in Supabase.

Usage:
    python -m app.jobs.sync_eva --year 2024
    python -m app.jobs.sync_eva --all-years
"""

import argparse
import asyncio
import logging
import sys
from typing import Optional

from app.integrations.eva_client import EVAClient
from app.repositories.agriculture_repository import AgricultureRepository
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
ag_repo = AgricultureRepository()
sync_repo = SyncRepository()


async def sync_eva_year(year: int) -> bool:
    """Synchronize EVA data for a specific year."""

    if not supabase_service.is_configured():
        logger.error("Supabase not configured")
        return False

    try:
        # Get data source UUID
        data_source = await data_source_repo.get_by_key("upra_eva")
        if not data_source:
            logger.error("Data source 'upra_eva' not found in database")
            return False

        source_id = data_source["id"]
        logger.info(f"Using source_id: {source_id} for year {year}")

        client = EVAClient()

        # Create sync run with UUID
        sync_run = await sync_repo.create_sync_run(
            source_id=source_id,
            sync_type=f"agricultural_stats_{year}",
        )
        sync_run_id = sync_run.get("id")

        total_processed = 0
        total_created = 0
        errors_count = 0

        logger.info(f"Starting EVA sync for year {year}")

        # Paginate through all records
        async for records_batch in client.paginate_year(year):
            for record in records_batch:
                try:
                    # Find matching geo_unit
                    geo_unit = await geo_repo.get_by_dane_code(
                        "municipality", record.dane_municipality_code
                    )

                    if not geo_unit:
                        logger.debug(
                            f"Municipality {record.dane_municipality_code} not found, skipping"
                        )
                        continue

                    # Normalize numeric values
                    area_planted = (
                        float(record.area_planted) if record.area_planted is not None else None
                    )
                    area_harvested = (
                        float(record.area_harvested)
                        if record.area_harvested is not None
                        else None
                    )
                    production = (
                        float(record.production) if record.production is not None else None
                    )
                    yield_value = float(record.yield_value) if record.yield_value is not None else None

                    # Upsert statistic
                    await ag_repo.upsert_stat(
                        geo_unit_id=geo_unit["id"],
                        year=year,
                        crop_name=record.crop,
                        crop_group=record.crop_group,
                        crop_subgroup=record.subgroup,
                        period=record.period,
                        area_planted_ha=area_planted,
                        area_harvested_ha=area_harvested,
                        production_tons=production,
                        yield_t_ha=yield_value,
                        source_id=source_id,
                        raw_data=record.dict(),
                    )

                    total_processed += 1
                    total_created += 1

                except Exception as e:
                    logger.error(f"Failed to process EVA record: {e}")
                    errors_count += 1

        # Update sync run
        await sync_repo.update_sync_run(
            sync_run_id=sync_run_id,
            status="success" if errors_count == 0 else "failed",
            records_processed=total_processed,
            records_created=total_created,
            errors_count=errors_count,
        )

        logger.info(
            f"EVA sync {year} completed: processed={total_processed}, "
            f"created={total_created}, errors={errors_count}"
        )

        return errors_count == 0

    except Exception as e:
        logger.error(f"EVA sync failed: {e}")
        return False


async def sync_eva_all_years():
    """Sync EVA data for all available years."""

    client = EVAClient()
    years = await client.get_all_years_available()

    logger.info(f"Syncing EVA data for years: {years}")

    for year in years:
        success = await sync_eva_year(year)
        if not success:
            logger.warning(f"Failed to sync year {year}, continuing...")

    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync EVA agricultural statistics")
    parser.add_argument("--year", type=int, help="Specific year to sync")
    parser.add_argument("--all-years", action="store_true", help="Sync all available years")

    args = parser.parse_args()

    if args.all_years:
        success = asyncio.run(sync_eva_all_years())
    elif args.year:
        success = asyncio.run(sync_eva_year(args.year))
    else:
        # Default to 2024
        success = asyncio.run(sync_eva_year(2024))

    sys.exit(0 if success else 1)
