import { apiClient } from './api';

// Contratos de /api/rankings y /api/me/ranking. Solo posición, nombre público, puntaje y territorio.

export type RankingScope = 'national' | 'department' | 'municipality';
export type RankingGame = 'general' | 'cosechas' | 'eco-puzzle' | 'cazadores-residuos';

export interface RankingTerritory {
  department_code: string | null;
  department_name: string | null;
  municipality_code: string | null;
  municipality_name: string | null;
}

export interface RankingEntry {
  rank: number;
  display_name: string;
  score: number;
  department_code: string | null;
  municipality_code: string | null;
  is_me: boolean;
}

export interface RankingResponse {
  scope: RankingScope;
  game: RankingGame;
  territory: RankingTerritory;
  count: number;
  entries: RankingEntry[];
}

export interface RankPosition {
  rank: number;
  of: number;
}

export interface MyRankingResponse {
  has_scores: boolean;
  best: Partial<Record<Exclude<RankingGame, 'general'>, number | null>>;
  general: number | null;
  territory: RankingTerritory;
  positions: { national: RankPosition | null; department: RankPosition | null; municipality: RankPosition | null };
  missing_territory: Array<'department' | 'municipality'>;
}

export interface RankingQuery {
  scope: RankingScope;
  game: RankingGame;
  department_code?: string;
  municipality_code?: string;
  limit?: number;
}

export const rankingsApi = {
  get: (query: RankingQuery) => apiClient.get<RankingResponse>('/api/rankings', { params: query }),
  me: () => apiClient.get<MyRankingResponse>('/api/me/ranking'),
};

export const GAME_LABELS: Record<RankingGame, string> = {
  general: 'General',
  cosechas: 'Cosechas',
  'eco-puzzle': 'Eco-Puzzle',
  'cazadores-residuos': 'Cazadores de Residuos',
};
