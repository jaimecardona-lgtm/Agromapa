"""Formato de dinero y precios para respuestas del agente. Mismo formato que el frontend (utils/money.ts).

Pesos colombianos (COP) con separador de miles con punto. Nunca "$8000" ni USD.
"""

from typing import Optional

_SHORT_UNITS = {"kg": "kg", "ton": "t", "units": "und", "liters": "L", "g": "g", "lb": "lb", "t": "t", "und": "und", "L": "L"}


def _group(digits: str) -> str:
    out = []
    while len(digits) > 3:
        out.insert(0, digits[-3:])
        digits = digits[:-3]
    out.insert(0, digits)
    return ".".join(out)


def format_cop(value: float) -> str:
    """'COP $8.000' (o 'COP $1.234,50' con centavos)."""
    sign = "-" if value < 0 else ""
    whole, _, cents = f"{abs(value):.2f}".partition(".")
    decimals = "" if cents == "00" else f",{cents}"
    return f"{sign}COP ${_group(whole)}{decimals}"


def format_price_per_unit(value: Optional[float], unit: str) -> Optional[str]:
    """'COP $8.000/kg', o None si no hay precio publicado."""
    if value is None:
        return None
    return f"{format_cop(float(value))}/{_SHORT_UNITS.get(unit, unit)}"
