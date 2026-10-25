"""Proveedores de imágenes ilustrativas. El dominio depende de este contrato, no de un proveedor concreto.

Estado actual: ningún adaptador de generación de imágenes está implementado ni verificado con las
credenciales del proyecto. Por eso el proveedor por defecto está DESHABILITADO de forma explícita.
Añadir un adaptador exige registrarlo en KNOWN_PROVIDERS y configurar IMAGE_GENERATION_PROVIDER.
"""

import logging
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger(__name__)

DISABLED_MESSAGE = "Generación de imágenes no configurada."


class ImageProviderError(Exception):
    """Fallo del proveedor al generar una imagen. El mensaje nunca incluye credenciales ni el prompt."""


class ImageProviderNotConfigured(ImageProviderError):
    """No hay proveedor de generación habilitado."""


class ImageGenerationProvider(Protocol):
    name: str

    async def generate(self, prompt: str) -> bytes:
        """Devuelve los bytes de una imagen (PNG, JPEG o WebP)."""
        ...


class DisabledImageProvider:
    name = "disabled"

    async def generate(self, prompt: str) -> bytes:
        raise ImageProviderNotConfigured(DISABLED_MESSAGE)


# Adaptadores reales se registran aquí. Vacío: ninguno está verificado todavía.
KNOWN_PROVIDERS: dict[str, type] = {}


def get_image_provider() -> ImageGenerationProvider:
    configured = (settings.IMAGE_GENERATION_PROVIDER or "").strip().lower()
    if not configured:
        return DisabledImageProvider()
    provider_class = KNOWN_PROVIDERS.get(configured)
    if provider_class is None:
        logger.warning("Proveedor de imágenes no implementado: %s. Generación deshabilitada.", configured)
        return DisabledImageProvider()
    return provider_class()
