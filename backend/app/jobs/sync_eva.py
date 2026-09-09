"""
Synchronization job for EVA agricultural statistics.

Fetches evaluation data from UPRA EVA Socrata API and stores it in Supabase.

Usage:
    python -m app.jobs.sync_eva --year 2024
    python -m app.jobs.sync_eva --year 2024 --dry-run --limit 10
    python -m app.jobs.sync_eva --all-years
"""

import argparse
import asyncio
import json
import logging
import sys

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


async def sync_eva_year(
    year: int,
    dry_run: bool = False,
    limit: int = None,
) -> bool:
    """
    Synchronize EVA data for a specific year.

    Args:
        year: Year to sync
        dry_run: If True, do not write to Supabase, only show what would be written
        limit: Maximum number of records to process (useful for testing)
    """

    if not supabase_service.is_configured() and not dry_run:
        logger.error("Supabase not configured")
        return False

    try:
        # For dry-run, use a placeholder source_id; otherwise fetch from database
        if dry_run:
            source_id = "00000000-0000-0000-0000-000000000000"  # Placeholder
            logger.info(f"DRY RUN MODE - Using placeholder source_id for year {year}")
        else:
            # Get data source UUID
            data_source = await data_source_repo.get_by_key("upra_eva")
            if not data_source:
                logger.error("Data source 'upra_eva' not found in database")
                return False

            source_id = data_source["id"]
            logger.info(f"Using source_id: {source_id} for year {year}")

        # Preload all municipalities to avoid N+1 queries
        logger.info("Preloading municipalities...")
        municipalities_list = await geo_repo.get_all_by_level("municipality")
        municipality_by_dane = {m["dane_code"]: m for m in municipalities_list}
        logger.info(f"Loaded {len(municipality_by_dane)} municipalities")

        if not municipality_by_dane:
            logger.warning("No municipalities found in database. Run sync_upra_geo first.")
            return False

        client = EVAClient()

        # Create sync run with UUID (only if not dry-run)
        sync_run_id = None
        if not dry_run:
            sync_run = await sync_repo.create_sync_run(
                source_id=source_id,
                sync_type=f"agricultural_stats_{year}",
            )
            sync_run_id = sync_run.get("id")

        total_processed = 0
        total_created = 0
        errors_count = 0
        missing_municipality_codes = set()
        dry_run_records = []
        records_to_write = []

        logger.info(f"Starting EVA sync for year {year} (dry_run={dry_run}, limit={limit})")

        # Paginate through all records
        async for records_batch in client.paginate_year(year):
            for record in records_batch:
                # Break if limit reached
                if limit and total_processed >= limit:
                    break

                try:
                    # Lookup in preloaded dictionary
                    geo_unit = municipality_by_dane.get(record.dane_municipality_code)

                    if not geo_unit:
                        missing_municipality_codes.add(record.dane_municipality_code)
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

                    # Generate source_record_key
                    source_record_key = record.generate_source_record_key()

                    # Prepare record data (all EVA dimensions)
                    record_data = {
                        "geo_unit_id": geo_unit["id"],
                        "year": year,
                        "crop_name": record.crop,
                        "crop_group": record.crop_group,
                        "crop_subgroup": record.subgroup,
                        "crop_code": record.crop_code,
                        "crop_cycle": record.crop_cycle,
                        "crop_disaggregation": record.crop_desagregation,
                        "crop_physical_state": record.crop_physical_state,
                        "crop_scientific_name": record.crop_scientific_name,
                        "period": record.period,
                        "area_planted_ha": area_planted,
                        "area_harvested_ha": area_harvested,
                        "production_tons": production,
                        "yield_t_ha": yield_value,
                        "source_id": source_id,
                        "source_record_key": source_record_key,
                        "raw_data": record.dict(),
                    }

                    if dry_run:
                        # Store for display
                        dry_run_records.append({
                            "municipality_dane": record.dane_municipality_code,
                            "municipality_name": geo_unit.get("name"),
                            "geo_unit_id": str(geo_unit["id"]),
                            "year": year,
                            "period": record.period,
                            "crop_name": record.crop,
                            "crop_cycle": record.crop_cycle,
                            "area_planted_ha": area_planted,
                            "area_harvested_ha": area_harvested,
                            "production_tons": production,
                            "yield_t_ha": yield_value,
                            "source_record_key": source_record_key,
                        })
                    else:
                        # Accumulate for bulk write
                        records_to_write.append(record_data)

                    total_processed += 1
                    total_created += 1

                except Exception as e:
                    logger.error(f"Failed to process EVA record: {e}")
                    errors_count += 1

            # Break outer loop if limit reached
            if limit and total_processed >= limit:
                break

        # Bulk upsert all records at once (if not dry-run)
        if not dry_run and records_to_write:
            try:
                bulk_result = await ag_repo.bulk_upsert_stats(records_to_write, batch_size=500)
                total_created = bulk_result.get("total_created", len(records_to_write))
                errors_count += len(bulk_result.get("errors", []))
            except Exception as e:
                logger.error(f"Bulk upsert failed: {e}")
                errors_count += 1
                total_created = 0

        if missing_municipality_codes:
            logger.warning(
                f"Missing {len(missing_municipality_codes)} municipality codes: "
                f"{sorted(missing_municipality_codes)}"
            )

        # Display dry-run results
        if dry_run:
            logger.info(f"\n{'='*80}\nDRY RUN RESULTS (limit={limit})\n{'='*80}")
            logger.info(f"Total records to be processed: {total_processed}")
            logger.info(f"Records: \n{json.dumps(dry_run_records, indent=2, ensure_ascii=False)}")
            logger.info(f"Missing municipality codes: {sorted(missing_municipality_codes)}")
        else:
            # Update sync run (only if not dry-run)
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
    parser.add_argument("--dry-run", action="store_true", help="Do not write to Supabase, only show what would be written")
    parser.add_argument("--limit", type=int, help="Maximum number of records to process (useful for testing)")

    args = parser.parse_args()

    if args.all_years:
        success = asyncio.run(sync_eva_all_years())
    elif args.year:
        success = asyncio.run(sync_eva_year(args.year, dry_run=args.dry_run, limit=args.limit))
    else:
        # Default to 2024
        success = asyncio.run(sync_eva_year(2024, dry_run=args.dry_run, limit=args.limit))

    sys.exit(0 if success else 1)
