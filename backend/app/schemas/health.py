from typing import Optional

from pydantic import BaseModel


class DatabaseHealth(BaseModel):
    status: str


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str
    version: str = "0.1.0"
    database: Optional[DatabaseHealth] = None
