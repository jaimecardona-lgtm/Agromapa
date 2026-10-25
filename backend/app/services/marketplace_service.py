"""Marketplace público: construye DTOs explícitos a partir de consultas con columnas acotadas.

Los errores de base de datos se propagan. Un fallo nunca se presenta como "sin fincas" ni "sin ofertas".
"""

import logging
from collections import defaultdict
from typing import Optional
from uuid import UUID

from app.repositories.geo_repository import GeoRepository
from app.repositories.identity_repository import identity_repository
from app.repositories.operational_repository import OperationalRepository
from app.schemas.marketplace import (
    PublicCrop,
    PublicFarm,
    PublicOffer,
    PublicProducerProfile,
    PublicTerritory,
)
from app.services.crop_image_service import crop_image_urls

logger = logging.getLogger(__name__)

op_repo = OperationalRepository()
geo_repo = GeoRepository()


async def _territories_by_id(municipality_ids: list[str]) -> dict[str, PublicTerritory]:
    rows = await op_repo.select_in("geo_units", "id", municipality_ids, "id,name,dane_code")
    return {str(row["id"]): PublicTerritory(code=row.get("dane_code"), name=row.get("name")) for row in rows}


async def _producer_names(producer_ids: list[str]) -> dict[str, dict]:
    """Solo productores activos. Nombre público: nombre comercial del perfil o nombre del registro."""
    if not producer_ids:
        return {}
    rows = await op_repo.select_in("producers", "id", producer_ids, "id,name,user_id,active")
    active = [row for row in rows if row.get("active")]
    profiles = await identity_repository.get_producer_profiles_by_users(
        [str(row["user_id"]) for row in active if row.get("user_id")]
    )
    result: dict[str, dict] = {}
    for row in active:
        profile = profiles.get(str(row["user_id"])) if row.get("user_id") else None
        result[str(row["id"])] = {
            "name": (profile or {}).get("business_name") or row["name"],
            "verified": bool((profile or {}).get("verified")),
        }
    return result


async def _build_public_farms(farm_rows: list[dict]) -> list[PublicFarm]:
    if not farm_rows:
        return []

    producer_ids = sorted({str(row["producer_id"]) for row in farm_rows if row.get("producer_id")})
    producers = await _producer_names(producer_ids)
    farm_ids = [str(row["id"]) for row in farm_rows]
    crop_rows = await op_repo.select_in("farm_crops", "farm_id", farm_ids, "id,farm_id,crop_name,area_hectares")
    crop_images = await crop_image_urls([str(crop["id"]) for crop in crop_rows], repo=op_repo)
    crops_by_farm: dict[str, list[PublicCrop]] = defaultdict(list)
    for crop in crop_rows:
        crops_by_farm[str(crop["farm_id"])].append(
            PublicCrop(
                name=str(crop["crop_name"]).strip(),
                area_hectares=crop.get("area_hectares"),
                image_url=crop_images.get(str(crop["id"])),
            )
        )
    territories = await _territories_by_id(sorted({str(row["municipality_id"]) for row in farm_rows}))

    farms: list[PublicFarm] = []
    for row in farm_rows:
        producer_id = str(row["producer_id"]) if row.get("producer_id") else None
        if producer_id and producer_id not in producers:
            # Productor inactivo o inexistente: su finca no se publica.
            continue
        producer = producers.get(producer_id) if producer_id else None
        territory = territories.get(str(row["municipality_id"]), PublicTerritory())
        farms.append(
            PublicFarm(
                id=UUID(str(row["id"])),
                name=row["name"],
                description=row.get("description"),
                area_ha=row.get("area_ha"),
                latitude=float(row["latitude"]),
                longitude=float(row["longitude"]),
                municipality_code=territory.code,
                municipality_name=territory.name,
                producer_id=UUID(producer_id) if producer_id else None,
                producer_name=producer["name"] if producer else None,
                producer_verified=producer["verified"] if producer else False,
                crops=crops_by_farm.get(str(row["id"]), []),
            )
        )
    return farms


async def get_public_farms_for_municipality(municipality_code: str) -> list[PublicFarm]:
    """Fincas activas de un municipio para el mapa y el asistente. Sin columnas privadas."""
    municipality = await geo_repo.get_by_dane_code("municipality", municipality_code)
    if not municipality:
        return []
    rows = await op_repo.list_public_farms(municipality_id=str(municipality["id"]))
    return await _build_public_farms(rows)


async def get_public_producer_profile(producer_id: UUID) -> Optional[PublicProducerProfile]:
    """Perfil público de un productor activo. None si no existe o está inactivo (-> 404)."""
    producer = await op_repo.get_row("producers", producer_id, "id,name,user_id,active")
    if producer is None or not producer.get("active"):
        return None

    user_id = str(producer["user_id"]) if producer.get("user_id") else None
    profiles = await identity_repository.get_producer_profiles_by_users([user_id] if user_id else [])
    profile = profiles.get(user_id) if user_id else None

    farm_rows = await op_repo.list_public_farms(producer_id=producer_id)
    farms = await _build_public_farms(farm_rows)

    municipality = PublicTerritory()
    department = PublicTerritory()
    if farm_rows:
        municipality_id = str(farm_rows[0]["municipality_id"])
        territory = (await _territories_by_id([municipality_id])).get(municipality_id)
        if territory is not None:
            municipality = territory
            if territory.code:
                dept = await geo_repo.get_by_dane_code("department", territory.code[:2])
                if dept:
                    department = PublicTerritory(code=dept.get("dane_code"), name=dept.get("name"))

    offer_rows = await op_repo.list_active_offers_by_producer(producer_id)
    offer_images = await crop_image_urls([str(r["farm_crop_id"]) for r in offer_rows if r.get("farm_crop_id")], repo=op_repo)
    offers = [
        PublicOffer(
            id=row["id"],
            crop_name=str(row["crop_name"]).strip(),
            farm_id=row["farm_id"],
            farm_name=row["farm_name"],
            municipality_code=row.get("municipality_code"),
            municipality_name=row.get("municipality_name"),
            quantity=row["quantity"],
            unit=row["unit"],
            price_per_unit=row.get("price_per_unit"),
            available_from=row.get("available_from"),
            available_until=row.get("available_until"),
            status=row["status"],
            description=row.get("description"),
            crop_image_url=offer_images.get(str(row.get("farm_crop_id"))),
        )
        for row in offer_rows
    ]

    return PublicProducerProfile(
        id=UUID(str(producer["id"])),
        name=(profile or {}).get("business_name") or producer["name"],
        verified=bool((profile or {}).get("verified")),
        description=(profile or {}).get("description"),
        department=department,
        municipality=municipality,
        farms=farms,
        active_offers=offers,
    )
