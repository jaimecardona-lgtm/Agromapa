"""Repository for sync tracking."""

import logging
from typing import Optional

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


class SyncRepository:
    """Repository for source_sync_runs table operations."""

    async def create_sync_run(
        self,
        source_id: str,
        sync_type: str,
    ) -> dict:
        """Create a new sync run."""

        if not supabase_service.is_configured():
            raise RuntimeError("Supabase not configured")

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        data = {
            "source_id": source_id,
            "sync_type": sync_type,
            "status": "running",
        }

        try:
            response = client.table("source_sync_runs").insert(data).execute()
            logger.info(f"Created sync run: {sync_type}")
            return response.data[0] if response.data else {}

        except Exception as e:
            logger.error(f"Failed to create sync run: {str(e)}")
            raise

    async def update_sync_run(
        self,
        sync_run_id: str,
        status: str,
        records_processed: Optional[int] = None,
        records_created: Optional[int] = None,
        records_updated: Optional[int] = None,
        errors_count: Optional[int] = None,
        error_details: Optional[dict] = None,
    ) -> dict:
        """Update a sync run."""

        if not supabase_service.is_configured():
            raise RuntimeError("Supabase not configured")

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        data = {
            "status": status,
            "completed_at": "now()" if status in ["success", "failed"] else None,
        }

        if records_processed is not None:
            data["records_processed"] = records_processed
        if records_created is not None:
            data["records_created"] = records_created
        if records_updated is not None:
            data["records_updated"] = records_updated
        if errors_count is not None:
            data["errors_count"] = errors_count
        if error_details is not None:
            data["error_details"] = error_details

        try:
            response = client.table("source_sync_runs").update(data).eq("id", sync_run_id).execute()
            logger.info(f"Updated sync run: {sync_run_id} -> {status}")
            return response.data[0] if response.data else {}

        except Exception as e:
            logger.error(f"Failed to update sync run: {str(e)}")
            raise
