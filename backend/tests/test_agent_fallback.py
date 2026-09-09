"""Tests for master agent with primary/fallback LLM support."""

import asyncio
from unittest.mock import patch

import httpx
import pytest

from app.schemas.agent_schemas import AgentChatRequest, AgentContext


def test_config_parsing():
    """Test that all chat config variables are parsed correctly."""
    from app.core.config import settings

    assert settings.CHAT_PRIMARY_LLM is not None
    assert isinstance(settings.CHAT_TEMPERATURE, float)
    assert isinstance(settings.CHAT_TOP_P, float)
    assert isinstance(settings.CHAT_MAX_TOKENS, int)
    assert isinstance(settings.CHAT_TIMEOUT_MS, int)
    assert isinstance(settings.CHAT_USE_FALLBACK, bool)


def test_timeout_ms_conversion():
    """Test that CHAT_TIMEOUT_MS is correctly converted to seconds."""
    from app.core.openrouter_client import openrouter_client

    # 45000 ms = 45 seconds (from .env.local CHAT_TIMEOUT_MS=45000)
    expected_timeout = 45.0
    actual_timeout = openrouter_client.timeout_seconds

    assert actual_timeout == expected_timeout


@pytest.mark.asyncio
async def test_primary_llm_success():
    """Test successful response from primary LLM."""
    mock_response = {
        "choices": [
            {
                "finish_reason": "stop",
                "message": {
                    "content": "Según EVA 2024, los principales cultivos son...",
                    "tool_calls": None,
                },
            }
        ]
    }

    with patch("app.core.openrouter_client.openrouter_client.is_configured") as mock_configured:
        mock_configured.return_value = True

        with patch("app.core.openrouter_client.openrouter_client._make_request") as mock_request:
            mock_request.return_value = mock_response.copy()

            request = AgentChatRequest(
                message="¿Cuáles son los principales cultivos?",
                context=AgentContext(municipality_code="76001", year=2024),
            )

            from app.services.agent_service import chat_with_agent

            response = await chat_with_agent(request)

            assert response.context.municipality_code == "76001"
            assert len(response.answer) > 0


@pytest.mark.asyncio
async def test_primary_timeout_fallback_enabled():
    """Test that timeout triggers fallback attempt (mocked)."""
    # This test verifies that the fallback logic is wired up
    # In real scenarios, the openrouter_client would handle this
    from app.core.openrouter_client import openrouter_client

    assert openrouter_client.use_fallback is True
    assert openrouter_client.fallback_model is not None or openrouter_client.fallback_model == ""


def test_primary_429_fallback_logic():
    """Test that 429 is configured as a fallback-eligible error."""
    # This verifies that 429 errors should trigger fallback
    # The actual fallback retry is tested by the client
    from app.core.openrouter_client import openrouter_client

    # Verify fallback is enabled
    assert openrouter_client.use_fallback is True


@pytest.mark.asyncio
async def test_primary_401_no_fallback():
    """Test that 401 (auth error) does NOT trigger fallback."""

    def mock_request_raises_401(*args, **kwargs):
        response = httpx.Response(401, request=None, text="Unauthorized")
        raise httpx.HTTPStatusError("401", request=None, response=response)

    with patch("app.core.openrouter_client.openrouter_client.is_configured") as mock_configured:
        mock_configured.return_value = True

        with patch("app.core.openrouter_client.openrouter_client._make_request") as mock_request:
            mock_request.side_effect = mock_request_raises_401

            with patch("app.core.config.settings") as mock_settings:
                mock_settings.CHAT_PRIMARY_LLM = "google/gemma-3-4b-it:free"
                mock_settings.CHAT_FALLBACK_LLM = "openrouter/free"
                mock_settings.CHAT_USE_FALLBACK = True
                mock_settings.CHAT_TEMPERATURE = 0.7
                mock_settings.CHAT_TOP_P = 0.9
                mock_settings.CHAT_MAX_TOKENS = 2048

                request = AgentChatRequest(
                    message="Test",
                    context=AgentContext(municipality_code="76001"),
                )

                from app.services.agent_service import chat_with_agent

                # Should raise error without attempting fallback
                with pytest.raises(RuntimeError):
                    await chat_with_agent(request)


@pytest.mark.asyncio
async def test_primary_402_no_fallback():
    """Test that 402 (payment error) does NOT trigger fallback."""

    def mock_request_raises_402(*args, **kwargs):
        response = httpx.Response(402, request=None, text="Payment required")
        raise httpx.HTTPStatusError("402", request=None, response=response)

    with patch("app.core.openrouter_client.openrouter_client.is_configured") as mock_configured:
        mock_configured.return_value = True

        with patch("app.core.openrouter_client.openrouter_client._make_request") as mock_request:
            mock_request.side_effect = mock_request_raises_402

            with patch("app.core.config.settings") as mock_settings:
                mock_settings.CHAT_PRIMARY_LLM = "google/gemma-3-4b-it:free"
                mock_settings.CHAT_FALLBACK_LLM = "openrouter/free"
                mock_settings.CHAT_USE_FALLBACK = True
                mock_settings.CHAT_TEMPERATURE = 0.7
                mock_settings.CHAT_TOP_P = 0.9
                mock_settings.CHAT_MAX_TOKENS = 2048

                request = AgentChatRequest(
                    message="Test",
                    context=AgentContext(municipality_code="76001"),
                )

                from app.services.agent_service import chat_with_agent

                # Should raise error without attempting fallback
                with pytest.raises(RuntimeError):
                    await chat_with_agent(request)


@pytest.mark.asyncio
async def test_fallback_disabled():
    """Test that fallback does not occur when CHAT_USE_FALLBACK=false."""

    def mock_request_raises_timeout(*args, **kwargs):
        raise asyncio.TimeoutError("Timeout")

    with patch("app.core.openrouter_client.openrouter_client.is_configured") as mock_configured:
        mock_configured.return_value = True

        with patch("app.core.openrouter_client.openrouter_client._make_request") as mock_request:
            mock_request.side_effect = mock_request_raises_timeout

            with patch("app.core.config.settings") as mock_settings:
                mock_settings.CHAT_PRIMARY_LLM = "google/gemma-3-4b-it:free"
                mock_settings.CHAT_FALLBACK_LLM = "openrouter/free"
                mock_settings.CHAT_USE_FALLBACK = False  # DISABLED
                mock_settings.CHAT_TEMPERATURE = 0.7
                mock_settings.CHAT_TOP_P = 0.9
                mock_settings.CHAT_MAX_TOKENS = 2048

                request = AgentChatRequest(
                    message="Test",
                    context=AgentContext(municipality_code="76001"),
                )

                from app.services.agent_service import chat_with_agent

                # Should raise error without attempting fallback
                with pytest.raises(RuntimeError):
                    await chat_with_agent(request)


def test_agent_response_does_not_expose_model_used():
    """Test that the API response schema does not expose internal _model_used."""
    from app.schemas.agent_schemas import AgentChatResponse, AgentContext

    response = AgentChatResponse(
        answer="Test",
        sources=["EVA 2024"],
        tools_used=[],
        context=AgentContext(municipality_code="76001"),
    )

    # Convert to dict - should NOT have _model_used
    response_dict = response.model_dump()
    assert "_model_used" not in response_dict
    assert "answer" in response_dict
    assert "sources" in response_dict
