"""Agent router for AgroMapa master agent."""

import logging

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.agent_schemas import AgentChatRequest, AgentChatResponse
from app.services.agent_service import chat_with_agent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=AgentChatResponse)
async def agent_chat(request: AgentChatRequest) -> AgentChatResponse:
    """Chat with the master agent."""

    if not settings.OPENROUTER_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Agent not available. OpenRouter is disabled.",
        )

    if not settings.OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Agent not available. OpenRouter API key not configured.",
        )

    try:
        response = await chat_with_agent(request)
        return response

    except RuntimeError as e:
        logger.error(f"Agent error: {str(e)}")
        raise HTTPException(status_code=503, detail="Agent service error")

    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
