"""OpenRouter client for agent interactions."""

import asyncio
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class OpenRouterClient:
    """Client for OpenRouter API interactions."""

    def __init__(self):
        self.enabled = settings.OPENROUTER_ENABLED
        self.base_url = settings.OPENROUTER_BASE_URL
        self.api_key = settings.OPENROUTER_API_KEY
        self.model = settings.OPENROUTER_MODEL or "openrouter/auto"

    def is_configured(self) -> bool:
        """Check if OpenRouter is properly configured."""
        return self.enabled and bool(self.api_key)

    async def chat_completion(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        tool_choice: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
    ) -> dict:
        """Call OpenRouter chat completion with tool support."""

        if not self.is_configured():
            raise RuntimeError("OpenRouter not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if tools:
            payload["tools"] = tools
            if tool_choice:
                payload["tool_choice"] = tool_choice

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )

                if response.status_code != 200:
                    logger.error(
                        f"OpenRouter API error: {response.status_code} {response.text}"
                    )
                    raise RuntimeError(f"OpenRouter API error: {response.status_code}")

                data = response.json()
                return data

        except asyncio.TimeoutError:
            logger.error("OpenRouter API request timeout")
            raise RuntimeError("OpenRouter API request timeout")
        except Exception as e:
            logger.error(f"OpenRouter API error: {str(e)}")
            raise


openrouter_client = OpenRouterClient()
