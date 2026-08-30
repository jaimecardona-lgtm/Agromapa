import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


class SupabaseService:
    def __init__(self):
        self.url = settings.SUPABASE_URL
        self.key = settings.SUPABASE_SECRET_KEY
        self._client = None

    def is_configured(self) -> bool:
        return bool(self.url and self.key)

    async def check_connection(self) -> bool:
        if not self.is_configured():
            logger.warning("Supabase not configured")
            return False

        try:
            from supabase import create_client

            client = create_client(self.url, self.key)
            client.table("information_schema.tables").select("*").limit(1).execute()
            logger.info("Supabase connection successful")
            return True
        except Exception as e:
            logger.error(f"Supabase connection failed: {str(e)}")
            return False


supabase_service = SupabaseService()
