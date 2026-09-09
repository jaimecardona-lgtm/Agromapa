"""Schemas for agent endpoint."""

from typing import Optional

from pydantic import BaseModel, Field


class AgentContext(BaseModel):
    """Context for agent operations."""

    department_code: Optional[str] = None
    municipality_code: Optional[str] = None
    year: int = Field(default=2024, ge=2000, le=2100)


class AgentChatRequest(BaseModel):
    """Request for agent chat endpoint."""

    message: str = Field(..., min_length=1, max_length=1000)
    context: AgentContext = Field(default_factory=lambda: AgentContext())


class AgentChatResponse(BaseModel):
    """Response from agent chat endpoint."""

    answer: str
    sources: list[str]
    tools_used: list[str]
    context: AgentContext


class AgentToolCall(BaseModel):
    """Represents a tool call result."""

    tool_name: str
    arguments: dict
    result: dict
    error: Optional[str] = None
