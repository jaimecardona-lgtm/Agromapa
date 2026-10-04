const BEST_SCORE_KEYS = {
  cosechas: 'raices-game-cosechas-best',
  ecoPuzzle: 'raices-game-eco-best',
  residuos: 'raices-game-residuos-best',
} as const;

export type GameKey = keyof typeof BEST_SCORE_KEYS;

export function getBestScore(game: GameKey): number | null {
  try {
    const key = BEST_SCORE_KEYS[game];
    const score = localStorage.getItem(key);
    return score ? parseInt(score, 10) : null;
  } catch (error) {
    console.error('Error reading best score:', error);
    return null;
  }
}

export function setBestScore(game: GameKey, score: number): boolean {
  try {
    const key = BEST_SCORE_KEYS[game];
    const currentBest = getBestScore(game);

    if (currentBest === null || score > currentBest) {
      localStorage.setItem(key, String(score));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error setting best score:', error);
    return false;
  }
}

export function formatBestScore(score: number | null): string {
  if (score === null) return '—';
  return score.toString();
}
