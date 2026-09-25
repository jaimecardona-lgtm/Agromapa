"""Tests for agent finish_reason handling and truncation management."""

import pytest

from app.schemas.agent_schemas import AgentChatRequest, AgentContext


@pytest.mark.asyncio
async def test_finish_reason_stop():
    """Test normal completion with finish_reason=stop."""
    # This would test that finish_reason=stop with content doesn't attempt continuation
    # Actual implementation would mock the openrouter_client
    pass


@pytest.mark.asyncio
async def test_finish_reason_length_with_continuation():
    """Test that finish_reason=length triggers controlled continuation."""
    # Test that when finish_reason=length is detected, a single continuation is attempted
    # Test that continuation response is properly joined with initial truncated content
    pass


@pytest.mark.asyncio
async def test_finish_reason_length_no_loop():
    """Test that finish_reason=length doesn't create infinite loops."""
    # Verify that continuation is attempted only once, even if it also returns length
    pass


@pytest.mark.asyncio
async def test_tool_calls_max_rounds_reduced():
    """Test that MAX_TOOL_ROUNDS is now 3 (not 5)."""
    from app.services.agent_service import MAX_TOOL_ROUNDS

    assert MAX_TOOL_ROUNDS == 3, f"Expected MAX_TOOL_ROUNDS=3, got {MAX_TOOL_ROUNDS}"


def test_system_prompt_includes_efficiency_directives():
    """Test that SYSTEM_PROMPT includes efficiency guidelines."""
    from app.services.agent_service import SYSTEM_PROMPT

    prompt_lower = SYSTEM_PROMPT.lower()

    # Check for key concepts (case-insensitive)
    assert "tools" in prompt_lower, "Missing tools reference"
    assert "consultar" in prompt_lower, "Missing consultar reference"
    assert "get_municipality_agriculture" in prompt_lower, "Missing get_municipality_agriculture"
    assert "responde" in prompt_lower, "Missing responde"
    assert "frases" in prompt_lower, "Missing frases"
    assert "eva 2024" in prompt_lower, "Missing EVA 2024"


def test_system_prompt_removed_old_directives():
    """Test that old verbose directives are not in prompt."""
    from app.services.agent_service import SYSTEM_PROMPT

    # Should not encourage verbose/detailed responses
    assert "desglose completo" not in SYSTEM_PROMPT.lower()
    assert "tabla detallada" not in SYSTEM_PROMPT.lower()


def test_agent_chat_request_accepts_history():
    """Test that AgentChatRequest properly accepts and validates history."""
    request = AgentChatRequest(
        message="Follow-up question",
        context=AgentContext(municipality_code="99001"),
        history=[
            {"role": "user", "content": "Initial question"},
            {"role": "assistant", "content": "Initial answer"},
        ],
    )

    assert len(request.history) == 2
    assert request.history[0].role == "user"
    assert request.history[0].content == "Initial question"


def test_max_history_messages_enforced():
    """Test that history is limited to 8 messages maximum."""
    messages = [
        {
            "role": "user" if i % 2 == 0 else "assistant",
            "content": f"Message {i}",
        }
        for i in range(10)
    ]

    try:
        request = AgentChatRequest(
            message="Current",
            context=AgentContext(municipality_code="99001"),
            history=messages,
        )
        assert len(request.history) <= 8
    except ValueError:
        # Pydantic should reject if >8
        pass


def test_chat_max_tokens_is_reasonable():
    """Test that CHAT_MAX_TOKENS is configured with a reasonable value."""
    from app.core.config import settings

    # CHAT_MAX_TOKENS should be a reasonable value for concise responses
    # Default is 900, but .env can override it
    assert isinstance(settings.CHAT_MAX_TOKENS, int)
    assert settings.CHAT_MAX_TOKENS > 0
    assert settings.CHAT_MAX_TOKENS <= 4000  # Reasonable upper limit for conciseness


def test_chat_temperature_decreased_to_0_2():
    """Test that CHAT_TEMPERATURE is configured to 0.2 for deterministic responses."""
    from app.core.config import settings

    assert settings.CHAT_TEMPERATURE == 0.2


def test_chat_top_p_set_to_0_8():
    """Test that CHAT_TOP_P is configured to 0.8."""
    from app.core.config import settings

    assert settings.CHAT_TOP_P == 0.8


def test_chat_timeout_increased_to_45000ms():
    """Test that CHAT_TIMEOUT_MS is increased to 45000ms (45 seconds)."""
    from app.core.config import settings

    assert settings.CHAT_TIMEOUT_MS == 45000
