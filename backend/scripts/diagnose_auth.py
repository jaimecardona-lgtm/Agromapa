"""Diagnóstico de la autenticación del backend. No imprime secretos ni tokens.

Uso (desde backend/):

    python scripts/diagnose_auth.py

Muestra si cada variable de Supabase está presente. Para probar una sesión real, pega el
access token en la variable de entorno AUTH_DIAG_TOKEN antes de ejecutar el script:

    PowerShell:  $env:AUTH_DIAG_TOKEN = "<access_token>"; python scripts/diagnose_auth.py
    Bash:        AUTH_DIAG_TOKEN="<access_token>" python scripts/diagnose_auth.py

El token se usa solo en memoria y no se muestra en la salida ni en los logs.
"""

import asyncio
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import auth  # noqa: E402
from app.core.config import settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
# httpx registra la URL completa de cada llamada: no aporta al diagnóstico y ensucia la salida.
logging.getLogger("httpx").setLevel(logging.WARNING)
# La consola de Windows puede usar cp1252; la salida del diagnóstico va en UTF-8.
sys.stdout.reconfigure(encoding="utf-8")

AUTH_VARIABLES = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY")


def report_configuration() -> None:
    print("Configuración (solo presencia):")
    for name in AUTH_VARIABLES:
        present = bool(getattr(settings, name, ""))
        print(f"  {name}: {'presente' if present else 'AUSENTE'}")
    missing = auth.missing_auth_settings()
    print(f"  Auth de validación lista: {'sí' if not missing else 'no, faltan ' + ', '.join(missing)}")


async def check_token(token: str) -> None:
    try:
        user = await auth.verify_access_token(token)
    except auth.AuthInvalidToken:
        print("Resultado: 401 -> token inválido, vencido o revocado (Supabase lo rechazó).")
    except auth.AuthServiceUnavailable as exc:
        print(f"Resultado: 503 -> dependencia/configuración no disponible. motivo={exc.reason}")
        print("Revisa el log de arriba: indica la causa exacta.")
    else:
        print(f"Resultado: 200 -> usuario válido resuelto (id terminado en ...{str(user.id)[-6:]}).")


def main() -> int:
    report_configuration()
    token = os.environ.get("AUTH_DIAG_TOKEN", "").strip()
    if not token:
        print("Sin AUTH_DIAG_TOKEN: no se validó ninguna sesión.")
        return 0
    asyncio.run(check_token(token))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
