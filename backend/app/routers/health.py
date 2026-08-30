from fastapi import APIRouter

from app.core.config import settings
from app.schemas.health import DatabaseHealth, HealthResponse
from app.services.supabase_service import supabase_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    db_status = None
    if supabase_service.is_configured():
        is_connected = await supabase_service.check_connection()
        db_status = DatabaseHealth(status="connected" if is_connected else "disconnected")
    else:
        db_status = DatabaseHealth(status="not_configured")

    return HealthResponse(
        status="ok",
        service="agromapa-api",
        environment=settings.APP_ENV,
        version="0.1.0",
        database=db_status,
    )
