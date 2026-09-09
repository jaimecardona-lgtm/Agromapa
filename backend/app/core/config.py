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
    OPENROUTER_MODEL: str = "openrouter/auto"

    # Chat LLM Configuration
    CHAT_PRIMARY_LLM: str = "openrouter/auto"
    CHAT_FALLBACK_LLM: str = ""
    CHAT_ENHANCEMENT_LLM: str = ""
    CHAT_JUDGE_LLM: str = ""

    # Chat Features
    CHAT_USE_FALLBACK: bool = True
    CHAT_USE_ENHANCEMENT: bool = False
    CHAT_USE_JUDGE: bool = False

    # Chat Parameters
    CHAT_TEMPERATURE: float = 0.7
    CHAT_TOP_P: float = 0.9
    CHAT_MAX_TOKENS: int = 2048
    CHAT_TIMEOUT_MS: int = 30000  # milliseconds

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def get_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.FRONTEND_ORIGINS.split(",")]


settings = Settings()
