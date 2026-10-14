"""Schemas for identity: profile, roles, producer/buyer profiles, guest score links.

Write schemas forbid unknown fields (extra="forbid"): a client cannot set
user_id, roles, verified or other server-owned fields through the body.
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["producer", "buyer"]
DEPARTMENT_CODE_PATTERN = r"^[0-9]{2}$"
MUNICIPALITY_CODE_PATTERN = r"^[0-9]{5}$"


class ProfileUpdate(BaseModel):
    """Campos del perfil que el usuario puede cambiar."""

    model_config = ConfigDict(extra="forbid")

    display_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    country_code: Optional[str] = Field(default=None, pattern=r"^[A-Z]{2}$")
    department_code: Optional[str] = Field(default=None, pattern=DEPARTMENT_CODE_PATTERN)
    municipality_code: Optional[str] = Field(default=None, pattern=MUNICIPALITY_CODE_PATTERN)

    @field_validator("display_name")
    @classmethod
    def _strip_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("El nombre no puede estar vacío")
        return cleaned


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    display_name: str
    country_code: str
    department_code: Optional[str] = None
    municipality_code: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ProducerProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business_name: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    public_phone: Optional[str] = Field(default=None, max_length=30)
    public_email: Optional[str] = Field(default=None, max_length=200)
    whatsapp: Optional[str] = Field(default=None, max_length=30)
    contact_visible: Optional[bool] = None


class ProducerProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    business_name: Optional[str] = None
    description: Optional[str] = None
    public_phone: Optional[str] = None
    public_email: Optional[str] = None
    whatsapp: Optional[str] = None
    contact_visible: bool
    verified: bool


class BuyerProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    organization: Optional[str] = Field(default=None, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    public_phone: Optional[str] = Field(default=None, max_length=30)
    public_email: Optional[str] = Field(default=None, max_length=200)


class BuyerProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    organization: Optional[str] = None
    description: Optional[str] = None
    public_phone: Optional[str] = None
    public_email: Optional[str] = None


class MeResponse(BaseModel):
    """Identidad del usuario autenticado. El email viene de Supabase Auth."""

    id: UUID
    email: Optional[str] = None
    profile: ProfileResponse
    roles: list[Role]
    producer_profile: Optional[ProducerProfileResponse] = None
    buyer_profile: Optional[BuyerProfileResponse] = None


class RolesResponse(BaseModel):
    roles: list[Role]


class GuestScoreLinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    player_id: UUID


class GuestScoreLinkResponse(BaseModel):
    player_id: UUID
    linked: int
