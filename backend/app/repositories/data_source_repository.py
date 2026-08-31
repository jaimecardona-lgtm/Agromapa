"""Repository for data sources."""

import logging
from typing import Optional

from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)


class DataSourceRepository:
    """Repository for data_sources table operations."""

    async def get_by_key(self, source_key: str) -> Optional[dict]:
        """Get data source by source_key and return UUID."""

        if not supabase_service.is_configured():
            logger.error("Supabase not configured")
            return None

        from supabase import create_client

        client = create_client(supabase_service.url, supabase_service.key)

        try:
            response = (
                client.table("data_sources")
                .select("id, source_key, name")
                .eq("source_key", source_key)
                .single()
                .execute()
            )

            logger.info(f"Found data source: {source_key} -> {response.data['id']}")
            return response.data

        except Exception as e:
            logger.error(f"Data source not found: {source_key} - {str(e)}")
            return None
