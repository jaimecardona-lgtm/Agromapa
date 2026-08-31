import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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


@app.get("/api/info")
async def api_info():
    """API information and documentation."""
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


# Serve React frontend from static directory
static_dir = Path(__file__).resolve().parents[1] / "static"

if static_dir.exists():
    logger.info(f"Serving static files from {static_dir}")

    assets_dir = static_dir / "assets"

    if assets_dir.exists():
        app.mount(
            "/assets",
            StaticFiles(directory=assets_dir),
            name="assets",
        )


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """Serve React SPA with fallback to index.html."""

    if full_path.startswith("api/"):
        raise HTTPException(
            status_code=404,
            detail="Not Found",
        )

    if static_dir.exists():
        if full_path:
            file_path = static_dir / full_path

            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)

        index_path = static_dir / "index.html"

        if index_path.exists():
            return FileResponse(index_path)

    raise HTTPException(
        status_code=404,
        detail="Not Found",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.APP_DEBUG,
    )
