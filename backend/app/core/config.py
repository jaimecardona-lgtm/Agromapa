from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "AgroMapa Colombia API"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    API_V1_PREFIX: str = "/api"

    FRONTEND_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    SUPABASE_URL: str = ""
    SUPABASE_SECRET_KEY: str = ""

    OPENROUTER_ENABLED: bool = False
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def get_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.FRONTEND_ORIGINS.split(",")]


settings = Settings()
