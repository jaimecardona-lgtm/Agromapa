"""OpenRouter client for agent interactions with primary/fallback support."""

import asyncio
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class OpenRouterClient:
    """Client for OpenRouter API with primary/fallback model support."""

    def __init__(self):
        self.enabled = settings.OPENROUTER_ENABLED
        self.base_url = settings.OPENROUTER_BASE_URL
        self.api_key = settings.OPENROUTER_API_KEY
        self.primary_model = settings.CHAT_PRIMARY_LLM or settings.OPENROUTER_MODEL
        self.fallback_model = settings.CHAT_FALLBACK_LLM
        self.use_fallback = settings.CHAT_USE_FALLBACK
        self.timeout_seconds = settings.CHAT_TIMEOUT_MS / 1000.0

    def is_configured(self) -> bool:
        """Check if OpenRouter is properly configured."""
        return self.enabled and bool(self.api_key)

    async def chat_completion(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        tool_choice: str | None = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> dict:
        """Call OpenRouter chat completion with primary/fallback support."""

        if not self.is_configured():
            raise RuntimeError("OpenRouter not configured")

        # Use parameters or defaults
        model = model or self.primary_model
        temperature = temperature if temperature is not None else settings.CHAT_TEMPERATURE
        top_p = top_p if top_p is not None else settings.CHAT_TOP_P
        max_tokens = max_tokens if max_tokens is not None else settings.CHAT_MAX_TOKENS

        try:
            result = await self._make_request(
                model=model,
                messages=messages,
                tools=tools,
                tool_choice=tool_choice,
                temperature=temperature,
                top_p=top_p,
                max_tokens=max_tokens,
            )
            result["_model_used"] = model
            return result

        except (asyncio.TimeoutError, httpx.TimeoutException) as e:
            logger.warning(f"Model {model} timeout. Error: {str(e)}")
            if self.use_fallback and self.fallback_model and model != self.fallback_model:
                logger.info(f"Attempting fallback model: {self.fallback_model}")
                return await self.chat_completion(
                    messages=messages,
                    tools=tools,
                    tool_choice=tool_choice,
                    model=self.fallback_model,
                    temperature=temperature,
                    top_p=top_p,
                    max_tokens=max_tokens,
                )
            raise

        except httpx.HTTPStatusError as e:
            status = e.response.status_code

            # NO fallback for auth/payment/validation errors
            if status in (401, 402, 403, 422):
                logger.error(f"Model {model} client error {status}. No fallback.")
                raise

            # NO fallback for generic 5xx errors (except availability issues)
            if status >= 500 and status not in (502, 503, 504):
                logger.error(f"Model {model} server error {status}. No fallback.")
                raise

            # YES fallback for: model not found, rate limits, service unavailable
            if status in (404, 429, 502, 503, 504):
                logger.warning(f"Model {model} error {status}. Attempting fallback.")
                if self.use_fallback and self.fallback_model and model != self.fallback_model:
                    logger.info(
                        f"Primary model {model} failed with {status}. "
                        f"Trying fallback model: {self.fallback_model}"
                    )
                    return await self.chat_completion(
                        messages=messages,
                        tools=tools,
                        tool_choice=tool_choice,
                        model=self.fallback_model,
                        temperature=temperature,
                        top_p=top_p,
                        max_tokens=max_tokens,
                    )
                logger.error(
                    f"Model {model} error {status} and no fallback configured or fallback already tried."
                )
            raise

        except Exception as e:
            logger.error(f"Model {model} unexpected error: {str(e)}")
            raise

    async def _make_request(
        self,
        model: str,
        messages: list[dict],
        tools: list[dict] | None,
        tool_choice: str | None,
        temperature: float,
        top_p: float,
        max_tokens: int,
    ) -> dict:
        """Make the actual HTTP request to OpenRouter."""

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max_tokens,
        }

        if tools:
            payload["tools"] = tools
            if tool_choice:
                payload["tool_choice"] = tool_choice

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )

            if response.status_code != 200:
                # Log error details for debugging
                if response.status_code >= 400:
                    logger.error(
                        "OpenRouter HTTP %d error. Model: %s, Payload summary: %d messages, "
                        "tools: %s. Response body: %s",
                        response.status_code,
                        model,
                        len(messages),
                        "yes" if tools else "no",
                        response.text[:2000],
                    )
                response.raise_for_status()

            data = response.json()
            return data


openrouter_client = OpenRouterClient()
