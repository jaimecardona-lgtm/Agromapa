"""Respuesta de generación de imagen ilustrativa de un cultivo."""

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel

CropImageStatus = Literal["none", "pending", "ready", "failed"]


class CropIllustrationResponse(BaseModel):
    farm_crop_id: UUID
    status: CropImageStatus
    image_url: Optional[str] = None
    label: Optional[str] = None
    message: Optional[str] = None
