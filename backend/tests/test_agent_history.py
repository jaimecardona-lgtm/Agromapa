"""Tests for agent chat history and conversation context."""

import pytest

from app.schemas.agent_schemas import (
    AgentChatRequest,
    AgentContext,
    ChatHistoryMessage,
)


def test_history_accepts_user_messages():
    """Test that user messages are accepted in history."""
    request = AgentChatRequest(
        message="¿Cuál tiene mayor producción?",
        context=AgentContext(municipality_code="99001"),
        history=[
            ChatHistoryMessage(role="user", content="¿Cuáles son los cultivos?"),
        ],
    )
    assert len(request.history) == 1
    assert request.history[0].role == "user"
    assert request.history[0].content == "¿Cuáles son los cultivos?"


def test_history_accepts_assistant_messages():
    """Test that assistant messages are accepted in history."""
    request = AgentChatRequest(
        message="¿Cuánta área sembrada?",
        context=AgentContext(municipality_code="99001"),
        history=[
            ChatHistoryMessage(role="assistant", content="Hay maíz y arroz."),
        ],
    )
    assert len(request.history) == 1
    assert request.history[0].role == "assistant"


def test_history_rejects_invalid_roles():
    """Test that invalid roles are rejected."""
    with pytest.raises(ValueError):
        ChatHistoryMessage(role="system", content="Invalid")

    with pytest.raises(ValueError):
        ChatHistoryMessage(role="tool", content="Invalid")


def test_history_enforces_max_length():
    """Test that history has maximum length of 8 messages."""
    messages = [
        ChatHistoryMessage(role="user", content=f"Message {i}") for i in range(10)
    ]
    # Pydantic should reject if >8 messages
    with pytest.raises(ValueError):
        AgentChatRequest(
            message="Current question",
            context=AgentContext(municipality_code="99001"),
            history=messages,
        )


def test_history_empty_by_default():
    """Test that history is empty by default."""
    request = AgentChatRequest(
        message="Test message",
        context=AgentContext(municipality_code="99001"),
    )
    assert request.history == []


def test_message_content_validation():
    """Test message content validation."""
    # Empty content should fail
    with pytest.raises(ValueError):
        ChatHistoryMessage(role="user", content="")

    # Very long content (over 5000 chars)
    with pytest.raises(ValueError):
        ChatHistoryMessage(role="user", content="x" * 5001)

    # Valid content
    msg = ChatHistoryMessage(
        role="user", content="x" * 5000
    )
    assert len(msg.content) == 5000
