import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import type { GameSlug } from '@/services/gameScores';
import { GAME_LABELS, rankingsApi, type MyRankingResponse, type RankingGame } from '@/services/rankings';

/**
 * Resultado de una partida para una cuenta: puntaje, mejor personal y posición municipal.
 * Una sola consulta al terminar la partida. Para invitados no se muestra nada aquí (hay un CTA aparte).
 */
export function RankingSnapshot({ gameSlug, score }: { gameSlug: GameSlug; score: number }) {
  const { status } = useAuth();
  const [mine, setMine] = useState<MyRankingResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return undefined;
    let cancelled = false;
    rankingsApi
      .me()
      .then((res) => {
        if (!cancelled) setMine(res.data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status !== 'authenticated') return null;

  const game = gameSlug as Exclude<RankingGame, 'general'>;
  const municipal = mine?.positions.municipality ?? null;

  return (
    <section className="ranking-snapshot" aria-label="Tu resultado en el ranking">
      <p>
        Puntaje obtenido: <strong>{score}</strong>
      </p>
      {failed && <p role="status">No pudimos cargar tu posición ahora.</p>}
      {mine && (
        <>
          <p>
            Mejor personal en {GAME_LABELS[game]}: <strong>{mine.best[game] ?? score}</strong>
          </p>
          {municipal ? (
            <p>
              Ranking municipal (general): <strong>#{municipal.rank} de {municipal.of}</strong>
            </p>
          ) : mine.missing_territory.includes('municipality') ? (
            <p>Completa tu municipio en Mi cuenta para participar en el ranking municipal.</p>
          ) : (
            <p>Sin posición municipal todavía.</p>
          )}
        </>
      )}
    </section>
  );
}
