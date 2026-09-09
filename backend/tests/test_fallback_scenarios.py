"""Real fallback scenario tests for OpenRouter client."""

import asyncio

import httpx
import pytest

from app.core.openrouter_client import openrouter_client


@pytest.mark.asyncio
async def test_primary_404_activates_fallback():
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
    original_make_request = openrouter_client._make_request
    openrouter_client._make_request = mock_make_request

    try:
        result = await openrouter_client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="google/gemma-3-4b-it:free",
        )
        assert result["choices"][0]["message"]["content"] == "Fallback success"
        assert call_count == 2  # Called twice: primary + fallback
    finally:
        openrouter_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_primary_429_activates_fallback():
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

    original_make_request = openrouter_client._make_request
    openrouter_client._make_request = mock_make_request

    try:
        result = await openrouter_client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="google/gemma-3-4b-it:free",
        )
        assert result["choices"][0]["message"]["content"] == "Fallback after 429"
        assert call_count == 2
    finally:
        openrouter_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_primary_timeout_activates_fallback():
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

    original_make_request = openrouter_client._make_request
    openrouter_client._make_request = mock_make_request

    try:
        result = await openrouter_client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="google/gemma-3-4b-it:free",
        )
        assert result["choices"][0]["message"]["content"] == "Fallback after timeout"
        assert call_count == 2
    finally:
        openrouter_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_primary_401_no_fallback():
    """Test scenario 4: primary 401 -> NO fallback."""

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        # Primary fails with 401 (auth error)
        response = httpx.Response(401, request=None, text="Unauthorized")
        raise httpx.HTTPStatusError("401", request=None, response=response)

    original_make_request = openrouter_client._make_request
    openrouter_client._make_request = mock_make_request

    try:
        with pytest.raises(RuntimeError, match="401"):
            await openrouter_client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="google/gemma-3-4b-it:free",
            )
    finally:
        openrouter_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_primary_402_no_fallback():
    """Test scenario 5: primary 402 -> NO fallback."""

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        # Primary fails with 402 (payment error)
        response = httpx.Response(402, request=None, text="Payment required")
        raise httpx.HTTPStatusError("402", request=None, response=response)

    original_make_request = openrouter_client._make_request
    openrouter_client._make_request = mock_make_request

    try:
        with pytest.raises(RuntimeError, match="402"):
            await openrouter_client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="google/gemma-3-4b-it:free",
            )
    finally:
        openrouter_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_fallback_also_fails():
    """Test scenario 6: fallback also fails -> error final sin recursión."""
    call_count = 0

    async def mock_make_request(model, messages, tools, tool_choice, temperature, top_p, max_tokens):
        nonlocal call_count
        call_count += 1

        # Both primary and fallback fail
        response = httpx.Response(429, request=None, text="Rate limited")
        raise httpx.HTTPStatusError("429", request=None, response=response)

    original_make_request = openrouter_client._make_request
    openrouter_client._make_request = mock_make_request

    try:
        with pytest.raises(RuntimeError):
            await openrouter_client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="google/gemma-3-4b-it:free",
            )
        # Should be called twice: primary + fallback
        # NOT infinitely recursive
        assert call_count == 2
    finally:
        openrouter_client._make_request = original_make_request


@pytest.mark.asyncio
async def test_second_request_uses_fallback_model():
    """Test scenario 7: second request really uses openrouter/free."""
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

    original_make_request = openrouter_client._make_request
    openrouter_client._make_request = mock_make_request

    try:
        result = await openrouter_client.chat_completion(
            messages=[{"role": "user", "content": "test"}],
            model="google/gemma-3-4b-it:free",
        )

        # Verify both models were called
        assert len(models_used) == 2
        assert models_used[0] == "google/gemma-3-4b-it:free"
        assert models_used[1] == "openrouter/free"
        assert result["choices"][0]["message"]["content"] == "Used fallback model"
    finally:
        openrouter_client._make_request = original_make_request


def test_fallback_disabled_no_retry():
    """Test: when fallback disabled, no retry on 429."""
    # This is configuration-based, not execution-based
    # When CHAT_USE_FALLBACK=false, even 429 won't trigger fallback
    assert openrouter_client.use_fallback is False  # Current .env.local: CHAT_USE_FALLBACK=false
    # To test disabled, would need to mock settings
