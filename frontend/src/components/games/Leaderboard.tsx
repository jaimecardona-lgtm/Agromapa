import { useEffect, useState } from 'react';
import { GameDifficulty, GameSlug, LeaderboardEntry, fetchLeaderboard, getOwnScoreIds } from '@/services/gameScores';
import { DIFFICULTY_LABELS } from './games/difficulties';

interface LeaderboardProps {
  slug: GameSlug;
  difficulty?: GameDifficulty | null;
  limit?: number;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; entries: LeaderboardEntry[] }
  | { status: 'error' };

export function Leaderboard({ slug, difficulty = null, limit = 10 }: LeaderboardProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    fetchLeaderboard(slug, difficulty, limit)
      .then((entries) => {
        if (alive) setState({ status: 'ready', entries });
      })
      .catch(() => {
        if (alive) setState({ status: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [slug, difficulty, limit, attempt]);

  const ownIds = new Set(getOwnScoreIds());

  return (
    <section className="leaderboard" aria-labelledby={`leaderboard-${slug}`}>
      <h3 id={`leaderboard-${slug}`} className="leaderboard-title">🏆 Clasificación</h3>

      {state.status === 'loading' && <p className="leaderboard-note">Cargando clasificación...</p>}

      {state.status === 'error' && (
        <div className="leaderboard-note">
          <p>No fue posible cargar la clasificación.</p>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}

      {state.status === 'ready' && state.entries.length === 0 && (
        <p className="leaderboard-note">Aún no hay partidas. ¡Sé el primero!</p>
      )}

      {state.status === 'ready' && state.entries.length > 0 && (
        <ol className="leaderboard-list">
          {state.entries.map((entry) => {
            const isOwn = ownIds.has(entry.id);
            return (
              <li key={entry.id} className={`leaderboard-row${isOwn ? ' is-own' : ''}`}>
                <span className="lb-rank">{entry.rank}</span>
                <span className="lb-alias">
                  {entry.player_alias || 'Jugador'}
                  {isOwn && <span className="lb-you"> (tú)</span>}
                </span>
                {entry.difficulty && <span className="lb-difficulty">{DIFFICULTY_LABELS[entry.difficulty]}</span>}
                <span className="lb-score">{entry.score}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
