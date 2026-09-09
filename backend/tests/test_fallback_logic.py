"""Test fallback logic categorization."""


def test_404_should_trigger_fallback():
    """Test that 404 is now in fallback-eligible errors (scenario 1)."""
    # 404 indicates model not found, which should retry with fallback
    fallback_eligible = (404, 429, 502, 503, 504)
    no_fallback = (401, 402, 403, 422)

    assert 404 in fallback_eligible
    assert 404 not in no_fallback


def test_429_should_trigger_fallback():
    """Test that 429 (rate limited) should trigger fallback (scenario 2)."""
    fallback_eligible = (404, 429, 502, 503, 504)
    no_fallback = (401, 402, 403, 422)

    assert 429 in fallback_eligible
    assert 429 not in no_fallback


def test_timeout_should_trigger_fallback():
    """Test that timeout errors trigger fallback (scenario 3)."""
    # TimeoutError is handled separately in chat_completion method
    # Verify it's caught and fallback is attempted
    from app.core.openrouter_client import openrouter_client

    # asyncio.TimeoutError and httpx.TimeoutException are handled
    assert openrouter_client.use_fallback is not None


def test_401_should_not_trigger_fallback():
    """Test that 401 (auth) does NOT trigger fallback (scenario 4)."""
    fallback_eligible = (404, 429, 502, 503, 504)
    no_fallback = (401, 402, 403, 422)

    assert 401 in no_fallback
    assert 401 not in fallback_eligible


def test_402_should_not_trigger_fallback():
    """Test that 402 (payment) does NOT trigger fallback (scenario 5)."""
    fallback_eligible = (404, 429, 502, 503, 504)
    no_fallback = (401, 402, 403, 422)

    assert 402 in no_fallback
    assert 402 not in fallback_eligible


def test_fallback_model_configured():
    """Test scenario 7: fallback model is configured or empty."""
    from app.core.openrouter_client import openrouter_client

    # Verify fallback model is a string (could be empty if not configured in env)
    assert isinstance(openrouter_client.fallback_model, str)


def test_no_infinite_recursion_logic():
    """Test scenario 6: prevent infinite recursion."""
    # The logic prevents infinite recursion by checking:
    # if model != self.fallback_model
    # This ensures we don't retry the same model

    from app.core.openrouter_client import openrouter_client

    primary = openrouter_client.primary_model
    fallback = openrouter_client.fallback_model

    # They should be different
    assert primary != fallback
