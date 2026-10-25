from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Raíces Conectadas API"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    API_V1_PREFIX: str = "/api"

    FRONTEND_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    SUPABASE_URL: str = ""
    # Clave pública (anon). Solo se usa para validar tokens de usuario contra Supabase Auth.
    SUPABASE_ANON_KEY: str = ""
    # Clave administrativa: solo backend. Nunca se envía al frontend.
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
    CHAT_TEMPERATURE: float = 0.2
    CHAT_TOP_P: float = 0.8
    CHAT_MAX_TOKENS: int = 900
    CHAT_TIMEOUT_MS: int = 45000  # milliseconds
    # Imágenes ilustrativas por cultivo. Vacío = generación deshabilitada (no hay proveedor verificado).
    IMAGE_GENERATION_PROVIDER: str = ""
    IMAGE_STORAGE_BUCKET: str = "crop-illustrations"
    IMAGE_MAX_BYTES: int = 3_000_000

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def get_cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.FRONTEND_ORIGINS.split(",")]


settings = Settings()
