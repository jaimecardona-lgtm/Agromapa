"""Schemas for public mini-game scores (Raíces Conectadas).

Sin autenticación no hay antifraude perfecto: estas reglas solo descartan
datos absurdos. Los valores enviados por el frontend nunca se confían ciegamente.
"""

import math
import re
from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

GameSlug = Literal["cosechas", "eco-puzzle", "cazadores-residuos"]
Difficulty = Literal["basico", "intermedio", "avanzado", "experto"]

QUIZ_GAMES = ("eco-puzzle", "cazadores-residuos")
DEFAULT_ALIAS = "Jugador"
MAX_ALIAS_LENGTH = 40

# Límites de juego (ver frontend/src/components/games/games/*Engine.ts).
MAX_QUIZ_ROUND_QUESTIONS = 6  # Cazadores de Residuos usa 6 preguntas por ronda
MAX_POINTS_PER_CORRECT = 175  # 100 base + 50 velocidad + 25 racha
MAX_LIVES = 3
MAX_COSECHAS_SCORE = 6000  # 30 s de juego más tiempo extra; el máximo real es menor
MAX_DURATION_SECONDS = 3600
MAX_METADATA_KEYS = 10
MAX_METADATA_STRING = 100

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_WHITESPACE = re.compile(r"\s+")


def sanitize_alias(raw: Optional[str]) -> str:
    """Normaliza el alias como texto plano: sin controles, sin HTML y sin espacios sobrantes."""
    if raw is None:
        return DEFAULT_ALIAS
    value = _CONTROL_CHARS.sub("", raw)
    value = value.replace("<", "").replace(">", "")
    value = _WHITESPACE.sub(" ", value).strip()
    if not value:
        return DEFAULT_ALIAS
    return value[:MAX_ALIAS_LENGTH]


class GameScoreCreate(BaseModel):
    player_id: UUID
    player_alias: Optional[str] = Field(default=None, max_length=200)
    game_slug: GameSlug
    difficulty: Optional[Difficulty] = None
    score: int = Field(ge=0)
    correct_answers: Optional[int] = Field(default=None, ge=0)
    wrong_answers: Optional[int] = Field(default=None, ge=0)
    best_streak: Optional[int] = Field(default=None, ge=0)
    lives_remaining: Optional[int] = Field(default=None, ge=0, le=MAX_LIVES)
    duration_seconds: Optional[int] = Field(default=None, ge=0, le=MAX_DURATION_SECONDS)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("player_alias", mode="before")
    @classmethod
    def _clean_alias(cls, value: Any) -> str:
        if value is not None and not isinstance(value, str):
            raise ValueError("player_alias debe ser texto")
        return sanitize_alias(value)

    @field_validator("metadata")
    @classmethod
    def _limit_metadata(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(value) > MAX_METADATA_KEYS:
            raise ValueError(f"metadata admite máximo {MAX_METADATA_KEYS} campos")
        for key, item in value.items():
            if not isinstance(key, str) or len(key) > 40:
                raise ValueError("las claves de metadata deben ser texto de máximo 40 caracteres")
            if isinstance(item, bool) or item is None:
                continue
            if isinstance(item, (int, float)):
                if isinstance(item, float) and not math.isfinite(item):
                    raise ValueError("metadata no admite números no finitos")
                continue
            if isinstance(item, str):
                if len(item) > MAX_METADATA_STRING:
                    raise ValueError("un valor de metadata es demasiado largo")
                continue
            raise ValueError("metadata solo admite valores escalares (sin objetos ni listas)")
        return value

    @model_validator(mode="after")
    def _check_game_rules(self) -> "GameScoreCreate":
        if self.game_slug == "cosechas":
            if self.difficulty is not None:
                raise ValueError("Cosechas no tiene dificultad")
            if self.score > MAX_COSECHAS_SCORE:
                raise ValueError(f"puntaje de Cosechas fuera de rango (máximo {MAX_COSECHAS_SCORE})")
            if any(v is not None for v in (self.correct_answers, self.wrong_answers, self.lives_remaining)):
                raise ValueError("Cosechas no reporta aciertos, errores ni vidas")
            return self

        # Juegos de quiz
        if self.difficulty is None:
            raise ValueError("los juegos de quiz requieren dificultad")
        required = {
            "correct_answers": self.correct_answers,
            "wrong_answers": self.wrong_answers,
            "best_streak": self.best_streak,
            "lives_remaining": self.lives_remaining,
        }
        missing = [name for name, value in required.items() if value is None]
        if missing:
            raise ValueError(f"campos requeridos para quiz: {', '.join(missing)}")

        correct = self.correct_answers or 0
        wrong = self.wrong_answers or 0
        if correct + wrong > MAX_QUIZ_ROUND_QUESTIONS:
            raise ValueError(f"aciertos + errores no pueden superar {MAX_QUIZ_ROUND_QUESTIONS}")
        if (self.lives_remaining or 0) + wrong > MAX_LIVES:
            raise ValueError("vidas restantes y errores no son coherentes con 3 vidas")
        if (self.best_streak or 0) > correct:
            raise ValueError("la mejor racha no puede superar los aciertos")
        if self.score > correct * MAX_POINTS_PER_CORRECT:
            raise ValueError("el puntaje es mayor al máximo posible para esos aciertos")
        return self


class GameScoreRecord(BaseModel):
    id: UUID
    player_alias: Optional[str] = None
    game_slug: GameSlug
    difficulty: Optional[Difficulty] = None
    score: int
    correct_answers: Optional[int] = None
    wrong_answers: Optional[int] = None
    best_streak: Optional[int] = None
    lives_remaining: Optional[int] = None
    duration_seconds: Optional[int] = None
    created_at: datetime


class LeaderboardEntry(BaseModel):
    rank: int
    id: UUID
    player_alias: Optional[str] = None
    score: int
    difficulty: Optional[Difficulty] = None
    created_at: datetime


class LeaderboardResponse(BaseModel):
    game_slug: GameSlug
    difficulty: Optional[Difficulty] = None
    limit: int
    count: int
    data: list[LeaderboardEntry]


class BestScoreEntry(BaseModel):
    score: int
    difficulty: Optional[Difficulty] = None
    created_at: datetime


class PlayerBestResponse(BaseModel):
    player_id: UUID
    best: dict[str, BestScoreEntry]


class PlayerHistoryResponse(BaseModel):
    player_id: UUID
    count: int
    data: list[GameScoreRecord]
