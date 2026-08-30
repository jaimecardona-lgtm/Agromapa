import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import demo, health

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.APP_NAME,
    description="Plataforma geoespacial agroproductiva",
    version="0.1.0",
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

# Routers
api_v1_prefix = settings.API_V1_PREFIX
app.include_router(health.router, prefix=api_v1_prefix, tags=["health"])
app.include_router(demo.router, prefix=f"{api_v1_prefix}/demo", tags=["demo"])

logger.info(f"Starting {settings.APP_NAME} in {settings.APP_ENV} mode")


@app.get("/")
async def root():
    return {
        "message": "AgroMapa Colombia API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/api/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.APP_DEBUG,
    )
