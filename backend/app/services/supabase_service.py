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

    def get_client(self):
        if not self.is_configured():
            raise RuntimeError("Supabase is not configured")

        if self._client is None:
            from supabase import create_client

            self._client = create_client(
                self.url,
                self.key,
            )

        return self._client

    async def check_connection(self) -> bool:
        if not self.is_configured():
            logger.warning("Supabase not configured")
            return False

        try:
            client = self.get_client()

            response = client.rpc(
                "health_check"
            ).execute()

            if not response.data:
                return False

            status = response.data[0].get("status")

            if status == "healthy":
                logger.info("Supabase connection successful")
                return True

            return False

        except Exception as exc:
            logger.error(
                "Supabase connection failed: %s",
                exc,
            )
            return False


supabase_service = SupabaseService()
