"""Agent router for Raíces Conectadas master agent."""

import asyncio
import logging

import httpx
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

    except (asyncio.TimeoutError, httpx.TimeoutException) as e:
        logger.error(f"Agent request timeout: {str(e)}")
        raise HTTPException(
            status_code=504,
            detail="Agent request timed out. Please try again.",
        )

    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        logger.error(f"OpenRouter HTTP {status} error: {e.response.text[:500]}")

        # Rate limiting
        if status == 429:
            raise HTTPException(
                status_code=429,
                detail="Agent rate limited. Please try again shortly.",
            )

        # Provider temporarily unavailable
        if status in (502, 503, 504):
            raise HTTPException(
                status_code=502,
                detail="Agent temporarily unavailable. Please try again.",
            )

        # Model not found
        if status == 404:
            raise HTTPException(
                status_code=502,
                detail="Configured LLM model not available.",
            )

        # Authentication or payment issues
        if status in (401, 402, 403):
            raise HTTPException(
                status_code=503,
                detail="Agent service not properly configured.",
            )

        # Other 4xx/5xx errors
        logger.error(f"OpenRouter error {status}")
        raise HTTPException(
            status_code=502,
            detail="Agent error. Please try again.",
        )

    except RuntimeError as e:
        error_msg = str(e)
        logger.error(f"Agent runtime error: {error_msg}")

        # Check if it's a configuration error
        if "not configured" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Agent not available. Please configure OpenRouter.",
            )

        raise HTTPException(status_code=500, detail="Internal server error")

    except Exception as e:
        logger.error(f"Unexpected agent error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
