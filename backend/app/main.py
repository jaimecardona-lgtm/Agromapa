import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import agriculture, farms, health, territories

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    description="Plataforma geoespacial agroproductiva",
    version="0.2.0",
    debug=settings.APP_DEBUG,
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers - Real data only
api_v1_prefix = settings.API_V1_PREFIX
app.include_router(health.router, prefix=api_v1_prefix, tags=["health"])
app.include_router(territories.router, prefix=api_v1_prefix)
app.include_router(agriculture.router, prefix=api_v1_prefix)
app.include_router(farms.router, prefix=api_v1_prefix)

logger.info(f"Starting {settings.APP_NAME} in {settings.APP_ENV} mode")


@app.get("/")
async def root():
    return {
        "message": "AgroMapa Colombia API",
        "version": "0.2.0",
        "docs": "/docs",
        "health": "/api/health",
        "endpoints": {
            "territories": "/api/territories/departments",
            "agriculture": "/api/agriculture/municipalities/{code}",
            "farms": "/api/farms/municipalities/{code}",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.APP_DEBUG,
    )
