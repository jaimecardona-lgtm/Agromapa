"""Imágenes ilustrativas por cultivo, generadas por IA y guardadas en Supabase Storage.

Reglas:
- La imagen describe el CULTIVO, no una oferta ni una finca específica. Las ofertas la heredan.
- Toda imagen se etiqueta como "Imagen ilustrativa generada por IA"; nunca es evidencia fotográfica.
- Solo el productor dueño del cultivo puede generar. El backend escribe la ruta y el tipo MIME.
- Una imagen 'ready' no se regenera automáticamente.
- Un fallo de proveedor, de validación o de subida deja el cultivo intacto y marca 'failed'.
- El prompt usa solo nombre del cultivo, municipio y departamento. Nunca descripción libre, coordenadas
  ni datos personales.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from app.core.auth import AuthUser
from app.core.config import settings
from app.core.ownership import require_farm_crop_owner
from app.repositories.geo_repository import GeoRepository
from app.repositories.operational_repository import OperationalRepository
from app.schemas.crop_images import CropIllustrationResponse
from app.services.image_providers import ImageProviderError, get_image_provider
from app.services.supabase_service import supabase_service

logger = logging.getLogger(__name__)

PROMPT_VERSION = "v1"
ILLUSTRATIVE_LABEL = "Imagen ilustrativa generada por IA"
CROP_COLUMNS = "id,farm_id,crop_name,illustrative_image_url,illustrative_image_status"

op_repo = OperationalRepository()
geo_repo = GeoRepository()


class ImageValidationError(Exception):
    pass


class ImageStorageError(Exception):
    pass


class ImageGenerationDisabled(Exception):
    pass


_CONTROL_OR_SYMBOLS = re.compile(r"[^\w\s\-áéíóúüñÁÉÍÓÚÜÑ]")
_LONG_DIGITS = re.compile(r"\d{4,}")  # teléfonos, documentos o códigos largos: nunca van al prompt


def safe_crop_name(raw: str) -> str:
    """Nombre de cultivo apto para el prompt: texto plano corto, sin símbolos, controles ni números largos."""
    cleaned = _CONTROL_OR_SYMBOLS.sub("", raw or "")
    cleaned = _LONG_DIGITS.sub("", cleaned).strip()
    return re.sub(r"\s+", " ", cleaned)[:60] or "cultivo"


def build_prompt(crop_name: str, municipality_name: Optional[str], department_name: Optional[str]) -> str:
    places = ", ".join(part for part in (municipality_name, department_name) if part)
    location = f" en zona rural de {places}, Colombia" if places else " en zona rural de Colombia"
    return (
        f"Ilustración fotorealista representativa de un cultivo de {safe_crop_name(crop_name)}{location}. "
        "Paisaje agrícola natural, luz diurna, enfoque documental limpio. "
        "Imagen ilustrativa, no representa una finca específica. "
        "Sin texto, sin logos, sin personas identificables."
    )


_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
)


def validate_image(data: bytes, max_bytes: Optional[int] = None) -> tuple[str, str]:
    """Devuelve (mime, extensión) si los bytes son PNG, JPEG o WebP y no superan el límite."""
    limit = max_bytes or settings.IMAGE_MAX_BYTES
    if not data:
        raise ImageValidationError("imagen vacía")
    if len(data) > limit:
        raise ImageValidationError("imagen demasiado grande")
    for signature, mime, ext in _SIGNATURES:
        if data.startswith(signature):
            return mime, ext
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    raise ImageValidationError("formato de imagen no permitido")


def object_path(farm_crop_id: UUID, extension: str) -> str:
    """Ruta estable y generada por el backend: nunca viene del cliente."""
    return f"farm-crops/{UUID(str(farm_crop_id))}/{PROMPT_VERSION}.{extension}"


class CropImageStorage:
    """Subida a Supabase Storage con la clave de servicio. Solo desde el backend."""

    def upload(self, path: str, data: bytes, mime: str) -> str:
        client = supabase_service.get_client()
        bucket = client.storage.from_(settings.IMAGE_STORAGE_BUCKET)
        try:
            bucket.upload(path, data, {"content-type": mime, "upsert": "true"})
            return bucket.get_public_url(path)
        except Exception as exc:
            raise ImageStorageError(type(exc).__name__) from exc


_storage = CropImageStorage()


def _result(crop_id: UUID, status: str, url: Optional[str] = None, message: Optional[str] = None) -> CropIllustrationResponse:
    return CropIllustrationResponse(
        farm_crop_id=UUID(str(crop_id)),
        status=status,
        image_url=url if status == "ready" else None,
        label=ILLUSTRATIVE_LABEL if status == "ready" and url else None,
        message=message,
    )


async def _crop_context(crop: dict) -> tuple[Optional[str], Optional[str]]:
    farm = await op_repo.get_row("farms", crop["farm_id"], "id,municipality_id")
    if not farm or not farm.get("municipality_id"):
        return None, None
    municipality = await op_repo.get_row("geo_units", farm["municipality_id"], "id,name,dane_code")
    if not municipality:
        return None, None
    department = None
    if municipality.get("dane_code"):
        department = await geo_repo.get_by_dane_code("department", str(municipality["dane_code"])[:2])
    return municipality.get("name"), (department or {}).get("name")


async def generate_for_crop(farm_crop_id: UUID, user: AuthUser, storage: Optional[CropImageStorage] = None) -> CropIllustrationResponse:
    """Genera la imagen ilustrativa de un cultivo propio. Sin reintentos automáticos."""
    await require_farm_crop_owner(farm_crop_id, user.id)
    crop = await op_repo.get_row("farm_crops", farm_crop_id, CROP_COLUMNS)
    if crop is None:
        raise ValueError("cultivo no encontrado")

    if crop.get("illustrative_image_status") == "ready" and crop.get("illustrative_image_url"):
        return _result(farm_crop_id, "ready", crop["illustrative_image_url"])

    provider = get_image_provider()
    if provider.name == "disabled":
        raise ImageGenerationDisabled()

    claimed = await op_repo.claim_crop_illustration(farm_crop_id)
    if claimed is None:
        return _result(farm_crop_id, "pending", message="La imagen ya se está generando.")

    municipality_name, department_name = await _crop_context(crop)
    prompt = build_prompt(crop["crop_name"], municipality_name, department_name)
    target = storage or _storage
    try:
        image = await provider.generate(prompt)
        mime, extension = validate_image(image)
        url = target.upload(object_path(farm_crop_id, extension), image, mime)
    except (ImageProviderError, ImageValidationError, ImageStorageError) as exc:
        # El cultivo se conserva; solo cambia el estado de la imagen. Nunca se registra el prompt ni los bytes.
        logger.warning("Imagen ilustrativa no generada (%s)", type(exc).__name__)
        await op_repo.set_crop_illustration(farm_crop_id, {"illustrative_image_status": "failed"})
        return _result(farm_crop_id, "failed", message="No pudimos generar la imagen. Puedes intentarlo de nuevo.")

    await op_repo.set_crop_illustration(
        farm_crop_id,
        {
            "illustrative_image_status": "ready",
            "illustrative_image_url": url,
            "illustrative_image_generated_at": datetime.now(timezone.utc).isoformat(),
            "illustrative_image_prompt_version": PROMPT_VERSION,
        },
    )
    return _result(farm_crop_id, "ready", url)


async def crop_image_urls(crop_ids: list[str], repo: Optional[OperationalRepository] = None) -> dict[str, str]:
    """URL de imagen 'ready' por cultivo. Si la consulta falla (p. ej. migración 014 aún no aplicada),
    las ofertas y fincas siguen funcionando sin imagen; el fallo queda registrado."""
    if not crop_ids:
        return {}
    try:
        rows = await (repo or op_repo).select_crop_image_rows(list({str(cid) for cid in crop_ids}))
    except Exception:
        logger.exception("No se pudieron leer las imágenes ilustrativas de cultivos")
        return {}
    return {
        str(row["id"]): row["illustrative_image_url"]
        for row in rows
        if row.get("illustrative_image_status") == "ready" and row.get("illustrative_image_url")
    }
