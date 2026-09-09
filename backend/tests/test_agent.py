"""Tests for master agent endpoint."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.agent_schemas import AgentChatRequest, AgentContext

client = TestClient(app)


def test_agent_disabled_when_not_configured():
    """Test agent endpoint returns 503 when OpenRouter disabled."""
    with patch("app.routers.agent.settings") as mock_settings:
        mock_settings.OPENROUTER_ENABLED = False
        mock_settings.OPENROUTER_API_KEY = ""

        response = client.post(
            "/api/agent/chat",
            json={
                "message": "¿Qué cultivos destacan aquí?",
                "context": {"municipality_code": "76001"},
            },
        )

        assert response.status_code == 503
        assert "disabled" in response.json()["detail"].lower()


def test_agent_missing_api_key():
    """Test agent endpoint returns 503 when API key missing."""
    with patch("app.routers.agent.settings") as mock_settings:
        mock_settings.OPENROUTER_ENABLED = True
        mock_settings.OPENROUTER_API_KEY = ""

        response = client.post(
            "/api/agent/chat",
            json={
                "message": "¿Qué cultivos destacan aquí?",
            },
        )

        assert response.status_code == 503


def test_agent_missing_message():
    """Test agent endpoint validates message."""
    response = client.post(
        "/api/agent/chat",
        json={"message": "", "context": {}},
    )

    assert response.status_code == 422  # Validation error


def test_agent_invalid_year():
    """Test agent endpoint validates year."""
    response = client.post(
        "/api/agent/chat",
        json={
            "message": "Test",
            "context": {"year": 1900},  # Invalid year
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_agent_chat_with_context():
    """Test agent chat includes context in response."""
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

        with patch("app.core.openrouter_client.openrouter_client.chat_completion") as mock_chat:
            mock_chat.return_value = mock_response

            request = AgentChatRequest(
                message="¿Qué cultivos destacan aquí?",
                context=AgentContext(
                    municipality_code="76001",
                    year=2024,
                ),
            )

            from app.services.agent_service import chat_with_agent

            response = await chat_with_agent(request)

            assert response.context.municipality_code == "76001"
            assert response.context.year == 2024
            assert "EVA 2024" in response.answer or len(response.answer) > 0


@pytest.mark.asyncio
async def test_agent_tool_execution_error_handling():
    """Test agent handles tool execution errors gracefully."""
    from app.tools.agent_tools import execute_tool

    result = await execute_tool("unknown_tool", {})

    assert result["success"] is False
    assert "Unknown tool" in result["error"]


@pytest.mark.asyncio
async def test_agent_get_municipality_agriculture_tool():
    """Test get_municipality_agriculture tool with mocked data."""
    from app.tools.agent_tools import execute_tool

    with patch("app.services.agriculture_service.get_municipality_agriculture") as mock_ag:
        mock_ag.return_value = {
            "municipality": {"dane_code": "76001", "name": "Cali"},
            "year": 2024,
            "source": {"id": "upra_eva", "name": "EVA"},
            "crops": [
                {
                    "crop_name": "coffee",
                    "area_planted_ha": 100.0,
                    "production_tons": 150.0,
                }
            ],
            "total_area_planted_ha": 100.0,
            "total_production_tons": 150.0,
        }

        result = await execute_tool(
            "get_municipality_agriculture",
            {"municipality_code": "76001", "year": 2024},
        )

        assert result["success"] is True
        assert result["data"]["municipality"]["dane_code"] == "76001"
        assert len(result["data"]["crops"]) > 0


def test_agent_response_schema():
    """Test agent response has required fields."""
    from app.schemas.agent_schemas import AgentChatResponse

    response = AgentChatResponse(
        answer="Test answer",
        sources=["EVA 2024"],
        tools_used=["get_departments"],
        context=AgentContext(municipality_code="76001"),
    )

    assert response.answer == "Test answer"
    assert len(response.sources) > 0
    assert len(response.tools_used) > 0
    assert response.context.municipality_code == "76001"
