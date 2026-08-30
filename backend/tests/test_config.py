from app.core.config import Settings


def test_settings_defaults():
    settings = Settings()
    assert settings.APP_NAME == "AgroMapa Colombia API"
    assert settings.APP_ENV == "development"
    assert settings.APP_DEBUG is True


def test_cors_origins_parsing():
    settings = Settings(FRONTEND_ORIGINS="http://localhost:3000,http://localhost:5173")
    origins = settings.get_cors_origins
    assert len(origins) == 2
    assert "http://localhost:3000" in origins
    assert "http://localhost:5173" in origins


def test_cors_origins_with_spaces():
    settings = Settings(FRONTEND_ORIGINS="http://localhost:3000 , http://localhost:5173")
    origins = settings.get_cors_origins
    assert len(origins) == 2
    assert "http://localhost:3000" in origins
    assert "http://localhost:5173" in origins
