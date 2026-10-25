import { apiClient } from './api';

// Identidad anónima del jugador: un UUID en localStorage y un alias opcional.
// No es una cuenta: no hay email, contraseña ni autenticación.

export type GameSlug = 'cosechas' | 'eco-puzzle' | 'cazadores-residuos';
export type GameDifficulty = 'basico' | 'intermedio' | 'avanzado' | 'experto';

export const DEFAULT_ALIAS = 'Jugador';
export const PLAYER_ID_KEY = 'raices-player-id';
export const PLAYER_ALIAS_KEY = 'raices-player-alias';
export const PLAYER_ONBOARDED_KEY = 'raices-player-onboarded';
export const OWN_SCORE_IDS_KEY = 'raices-own-score-ids';
const MAX_OWN_SCORE_IDS = 200;
const MAX_ALIAS_LENGTH = 40;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GameScorePayload {
  game_slug: GameSlug;
  difficulty: GameDifficulty | null;
  score: number;
  correct_answers?: number | null;
  wrong_answers?: number | null;
  best_streak?: number | null;
  lives_remaining?: number | null;
  duration_seconds?: number | null;
  metadata?: Record<string, string | number | boolean>;
}

export interface SavedScore {
  id: string;
  game_slug: GameSlug;
  difficulty: GameDifficulty | null;
  score: number;
  created_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  player_alias: string | null;
  score: number;
  difficulty: GameDifficulty | null;
  created_at: string;
}

export type SubmitResult = { ok: true; saved: SavedScore } | { ok: false; reason: string };

/** Partida terminada que no se pudo guardar por sesión expirada. Vive en sessionStorage, nunca se reenvía sola. */
export interface PendingScore {
  payload: GameScorePayload;
  playerId: string;
  alias: string;
}

export const PENDING_SCORE_KEY = 'raices-pending-score';

export function savePendingScore(pending: PendingScore): void {
  try {
    window.sessionStorage.setItem(PENDING_SCORE_KEY, JSON.stringify(pending));
  } catch {
    // Sin sessionStorage el resultado sigue en la pantalla mientras no se recargue.
  }
}

export function readPendingScore(): PendingScore | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_SCORE_KEY);
    return raw ? (JSON.parse(raw) as PendingScore) : null;
  } catch {
    return null;
  }
}

export function clearPendingScore(): void {
  try {
    window.sessionStorage.removeItem(PENDING_SCORE_KEY);
  } catch {
    // Nada que limpiar si el almacenamiento no está disponible.
  }
}

// Respaldo en memoria si localStorage no está disponible (modo privado, bloqueos).
let memoryPlayerId: string | null = null;
let memoryAlias: string | null = null;

// undefined = almacenamiento no disponible (se usa el respaldo en memoria).
function readStorage(key: string): string | null | undefined {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento: la sesión sigue funcionando con el respaldo en memoria.
  }
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Devuelve el UUID del jugador; lo crea la primera vez. */
export function getPlayerId(): string {
  const fromStorage = readStorage(PLAYER_ID_KEY);
  const stored = fromStorage === undefined ? memoryPlayerId : fromStorage;
  if (stored && UUID_PATTERN.test(stored)) {
    memoryPlayerId = stored;
    return stored;
  }
  const created = generateUuid();
  memoryPlayerId = created;
  writeStorage(PLAYER_ID_KEY, created);
  return created;
}

/** UUID del jugador si ya existe en este navegador. No lo crea. */
export function getStoredPlayerId(): string | null {
  const fromStorage = readStorage(PLAYER_ID_KEY);
  const stored = fromStorage === undefined ? memoryPlayerId : fromStorage;
  return stored && UUID_PATTERN.test(stored) ? stored : null;
}

/**
 * Descarta la identidad de invitado de este navegador (al cerrar sesión).
 * La siguiente partida anónima usa un UUID nuevo, así dos cuentas no comparten invitado.
 */
export function resetPlayerId(): void {
  memoryPlayerId = null;
  writeStorage(PLAYER_ID_KEY, null);
  writeStorage(OWN_SCORE_IDS_KEY, null);
}

export function getPlayerAlias(): string {
  const fromStorage = readStorage(PLAYER_ALIAS_KEY);
  const stored = (fromStorage === undefined ? memoryAlias : fromStorage)?.trim();
  return stored ? stored : DEFAULT_ALIAS;
}

/** Guarda el alias. Vacío = alias por defecto (se elimina lo guardado). */
export function setPlayerAlias(raw: string): string {
  const alias = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_ALIAS_LENGTH);
  memoryAlias = alias || null;
  writeStorage(PLAYER_ALIAS_KEY, alias || null);
  return alias || DEFAULT_ALIAS;
}

export function isPlayerOnboarded(): boolean {
  return readStorage(PLAYER_ONBOARDED_KEY) === '1';
}

export function markPlayerOnboarded(): void {
  writeStorage(PLAYER_ONBOARDED_KEY, '1');
}

export function getOwnScoreIds(): string[] {
  try {
    const raw = readStorage(OWN_SCORE_IDS_KEY) ?? null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function rememberOwnScore(id: string): void {
  const ids = [id, ...getOwnScoreIds().filter((existing) => existing !== id)].slice(0, MAX_OWN_SCORE_IDS);
  writeStorage(OWN_SCORE_IDS_KEY, JSON.stringify(ids));
}

/**
 * Envía una partida al backend. Nunca lanza: devuelve ok/reason para que la
 * pantalla de resultados muestre el estado sin perder la partida local.
 */
export async function submitGameScore(
  payload: GameScorePayload,
  identity: { playerId?: string; alias?: string } = {},
): Promise<SubmitResult> {
  const playerId = identity.playerId ?? getPlayerId();
  const alias = identity.alias ?? getPlayerAlias();
  try {
    const response = await apiClient.post<SavedScore>('/api/games/scores', {
      ...payload,
      player_id: playerId,
      player_alias: alias,
    });
    rememberOwnScore(response.data.id);
    clearPendingScore();
    return { ok: true, saved: response.data };
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      // La sesión venció: se conserva la partida con su mismo player_id para reintentar tras iniciar sesión.
      savePendingScore({ payload, playerId, alias });
      return { ok: false, reason: 'session_expired' };
    }
    return { ok: false, reason: status ? `HTTP ${status}` : 'network' };
  }
}

export async function fetchLeaderboard(
  slug: GameSlug,
  difficulty?: GameDifficulty | null,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const response = await apiClient.get<{ data: LeaderboardEntry[] }>(`/api/games/leaderboard/${slug}`, {
    params: { limit, ...(difficulty ? { difficulty } : {}) },
  });
  return response.data.data;
}

/** Texto para compartir o copiar. Usa el origen actual; nunca localhost fijo. */
export function gamePublicUrl(path: string): string {
  return `${window.location.origin}${path}`;
}
