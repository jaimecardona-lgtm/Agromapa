"""
Cali Rural products client (optional integration).

Municipality of Santiago de Cali agricultural data.
"""

import logging

logger = logging.getLogger(__name__)


class CaliRuralClient:
    """Client for Cali rural agricultural data."""

    CKAN_HOST = "datos.cali.gov.co"
    ENABLED = False

    def __init__(self, enabled: bool = False):
        self.enabled = enabled

    async def discover_datasets(self) -> dict:
        """Discover available datasets from Cali CKAN."""

        if not self.enabled:
            logger.info("Cali Rural client is disabled")
            return {}

        logger.info("Cali Rural integration not yet implemented")
        return {}
