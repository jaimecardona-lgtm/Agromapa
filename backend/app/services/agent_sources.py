"""Taxonomía de fuentes del agente. Cada herramienta pertenece a exactamente una categoría.

Regla: EVA es histórica y nunca prueba disponibilidad actual. Solo las ofertas vigentes lo son.
Las etiquetas de fuente que llegan al usuario salen de aquí, no de nombres de herramientas.
"""

from enum import Enum
from typing import Iterable, Optional


class SourceCategory(str, Enum):
    TERRITORIAL = "territorial"
    EVA_HISTORICAL = "eva_historical"
    OPERATIONAL_FARMS = "operational_farms"
    OPERATIONAL_CROPS = "operational_crops"
    MARKETPLACE_OFFERS = "marketplace_offers"
    PUBLIC_PRODUCERS = "public_producers"


TOOL_CATEGORY: dict[str, SourceCategory] = {
    "get_departments": SourceCategory.TERRITORIAL,
    "get_department_municipalities": SourceCategory.TERRITORIAL,
    "get_municipality": SourceCategory.TERRITORIAL,
    "get_municipality_agriculture": SourceCategory.EVA_HISTORICAL,
    "get_department_agriculture": SourceCategory.EVA_HISTORICAL,
    "search_crop": SourceCategory.EVA_HISTORICAL,
    "get_municipality_farms": SourceCategory.OPERATIONAL_FARMS,
    "get_current_offers": SourceCategory.MARKETPLACE_OFFERS,
    "search_available_product": SourceCategory.MARKETPLACE_OFFERS,
    "get_producer_profile": SourceCategory.PUBLIC_PRODUCERS,
}

EVA_TOOLS = frozenset(name for name, cat in TOOL_CATEGORY.items() if cat is SourceCategory.EVA_HISTORICAL)


def source_labels(categories: Iterable[SourceCategory], eva_years: Iterable[int]) -> list[str]:
    """Etiquetas de fuente para el usuario, en orden estable. Sin enlaces ni referencias inventadas."""
    labels: list[str] = []
    cats = set(categories)
    if SourceCategory.TERRITORIAL in cats:
        labels.append("Catálogo territorial DANE")
    if SourceCategory.EVA_HISTORICAL in cats:
        years = sorted({int(y) for y in eva_years}) or [2024]
        labels.append(
            f"EVA {', '.join(str(y) for y in years)} - Estadísticas agrícolas oficiales "
            "(histórico, no es disponibilidad actual)"
        )
    if SourceCategory.OPERATIONAL_FARMS in cats:
        labels.append("Fincas registradas en Raíces Conectadas")
    if SourceCategory.MARKETPLACE_OFFERS in cats:
        labels.append("Ofertas vigentes registradas en Raíces Conectadas (disponibilidad actual)")
    if SourceCategory.PUBLIC_PRODUCERS in cats:
        labels.append("Perfiles públicos de productores de Raíces Conectadas")
    return labels


def category_of(tool_name: str) -> Optional[SourceCategory]:
    return TOOL_CATEGORY.get(tool_name)
