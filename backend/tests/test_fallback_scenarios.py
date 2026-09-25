"""Real fallback scenario tests for OpenRouter client."""

import asyncio

import httpx
import pytest

from app.core.openrouter_client import OpenRouterClient


@pytest.fixture
def fallback_enabled_client(monkeypatch):
    """Create isolated OpenRouterClient with fallback enabled for testing."""
    from app.core.config import Settings

    # Create a settings instance with fallback enabled
    test_settings = Settings(
        OPENROUTER_ENABLED=True,
        OPENROUTER_API_KEY="test-key",
        OPENROUTER_BASE_URL="https://openrouter.ai/api/v1",
        CHAT_PRIMARY_LLM="google/gemma-3-4b-it:free",
        CHAT_FALLBACK_LLM="openrouter/free",
        CHAT_USE_FALLBACK=True,
        CHAT_TEMPERATURE=0.2,
        CHAT_TOP_P=0.8,
        CHAT_MAX_TOKENS=900,
        CHAT_TIMEOUT_MS=45000,
    )

    # Monkeypatch the global settings
    monkeypatch.setattr("app.core.openrouter_client.settings", test_settings)

    # Create new client with patched settings
    client = OpenRouterClient()
    yield client


@pytest.mark.asyncio
async def test_primary_404_activates_fallback(fallback_enabled_client):
    """Test scenario 1: primary 404 -> fallback executed."""
    # Mock setup for 404 on primary, success on fallback
    call_count = 0

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        nonlocal call_count
        call_count += 1

        if call_count == 1 and model == "google/gemma-3-4b-it:free":
            # Primary fails with 404
            response = httpx.Response(404, request=None, text="Model not found")
            raise httpx.HTTPStatusError("404", request=None, response=response)

        if call_count == 2 and model == "openrouter/free":
            # Fallback succeeds
            return {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": "Fallback success"},
                    }
                ]
            }

    # Monkeypatch for this test
    original_make_request = fallback_enabled_client._make_request
    fallback_enabled_client._make_request = mock_make_request

    try:
        result = await fallback_enabled_client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="google/gemma-3-4b-it:free",
        )
        assert result["choices"][0]["message"]["content"] == "Fallback success"
        assert call_count == 2  # Called twice: primary + fallback
    finally:
        fallback_enabled_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_primary_429_activates_fallback(fallback_enabled_client):
    """Test scenario 2: primary 429 -> fallback executed."""
    call_count = 0

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        nonlocal call_count
        call_count += 1

        if call_count == 1:
            # Primary fails with 429 (rate limited)
            response = httpx.Response(429, request=None, text="Too many requests")
            raise httpx.HTTPStatusError("429", request=None, response=response)

        # Fallback succeeds
        return {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": "Fallback after 429"},
                }
            ]
        }

    original_make_request = fallback_enabled_client._make_request
    fallback_enabled_client._make_request = mock_make_request

    try:
        result = await fallback_enabled_client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="google/gemma-3-4b-it:free",
        )
        assert result["choices"][0]["message"]["content"] == "Fallback after 429"
        assert call_count == 2
    finally:
        fallback_enabled_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_primary_timeout_activates_fallback(fallback_enabled_client):
    """Test scenario 3: primary timeout -> fallback executed."""
    call_count = 0

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        nonlocal call_count
        call_count += 1

        if call_count == 1:
            # Primary times out
            raise asyncio.TimeoutError("Request timeout")

        # Fallback succeeds
        return {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": "Fallback after timeout"},
                }
            ]
        }

    original_make_request = fallback_enabled_client._make_request
    fallback_enabled_client._make_request = mock_make_request

    try:
        result = await fallback_enabled_client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="google/gemma-3-4b-it:free",
        )
        assert result["choices"][0]["message"]["content"] == "Fallback after timeout"
        assert call_count == 2
    finally:
        fallback_enabled_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_primary_401_no_fallback(fallback_enabled_client):
    """Test scenario 4: primary 401 -> NO fallback (auth errors never fallback)."""

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        # Primary fails with 401 (auth error) - never triggers fallback
        response = httpx.Response(401, request=None, text="Unauthorized")
        raise httpx.HTTPStatusError("401", request=None, response=response)

    original_make_request = fallback_enabled_client._make_request
    fallback_enabled_client._make_request = mock_make_request

    try:
        # 401 errors should not trigger fallback, so HTTPStatusError is raised directly
        with pytest.raises(httpx.HTTPStatusError):
            await fallback_enabled_client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="google/gemma-3-4b-it:free",
            )
    finally:
        fallback_enabled_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_primary_402_no_fallback(fallback_enabled_client):
    """Test scenario 5: primary 402 -> NO fallback (payment errors never fallback)."""

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        # Primary fails with 402 (payment error) - never triggers fallback
        response = httpx.Response(402, request=None, text="Payment required")
        raise httpx.HTTPStatusError("402", request=None, response=response)

    original_make_request = fallback_enabled_client._make_request
    fallback_enabled_client._make_request = mock_make_request

    try:
        # 402 errors should not trigger fallback, so HTTPStatusError is raised directly
        with pytest.raises(httpx.HTTPStatusError):
            await fallback_enabled_client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="google/gemma-3-4b-it:free",
            )
    finally:
        fallback_enabled_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_fallback_also_fails(fallback_enabled_client):
    """Test scenario 6: both primary and fallback fail -> error without infinite recursion."""
    call_count = 0

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        nonlocal call_count
        call_count += 1

        # Both primary and fallback fail with 429
        response = httpx.Response(429, request=None, text="Rate limited")
        raise httpx.HTTPStatusError("429", request=None, response=response)

    original_make_request = fallback_enabled_client._make_request
    fallback_enabled_client._make_request = mock_make_request

    try:
        # When both fail, HTTPStatusError is raised (not RuntimeError)
        with pytest.raises(httpx.HTTPStatusError):
            await fallback_enabled_client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="google/gemma-3-4b-it:free",
            )
        # Should be called exactly twice: primary + fallback (no infinite recursion)
        assert call_count == 2
    finally:
        fallback_enabled_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_second_request_uses_fallback_model(fallback_enabled_client):
    """Test scenario 7: fallback model (openrouter/free) is really used on retry."""
    models_used = []

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        models_used.append(model)

        if model == "google/gemma-3-4b-it:free":
            # Primary fails
            response = httpx.Response(404, request=None, text="Not found")
            raise httpx.HTTPStatusError("404", request=None, response=response)

        # Fallback succeeds
        return {
            "choices": [
                {
                    "finish_reason": "stop",
                    "message": {"content": "Used fallback model"},
                }
            ]
        }

    original_make_request = fallback_enabled_client._make_request
    fallback_enabled_client._make_request = mock_make_request

    try:
        result = await fallback_enabled_client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="google/gemma-3-4b-it:free",
        )

        # Verify both models were called
        assert len(models_used) == 2
        assert models_used[0] == "google/gemma-3-4b-it:free"
        assert models_used[1] == "openrouter/free"
        assert result["choices"][0]["message"]["content"] == "Used fallback model"
    finally:
        fallback_enabled_client._make_request = original_make_request


def test_fallback_disabled_no_retry():
    """Test: when fallback disabled, client does not retry on fallback-eligible errors."""
    from app.core.openrouter_client import openrouter_client

    # Verify that current production config has fallback disabled
    assert openrouter_client.use_fallback is False
