import { useEffect, useRef, useState } from 'react';
import { GameScorePayload, submitGameScore } from '@/services/gameScores';
import { Leaderboard } from './Leaderboard';

interface ScoreReportProps {
  payload: GameScorePayload;
}

type SaveStatus = 'saving' | 'saved' | 'error';

/**
 * Guarda la partida al terminar y muestra su estado. No bloquea la pantalla de
 * resultados: si falla, la partida sigue visible y el resultado local se conserva.
 */
export function ScoreReport({ payload }: ScoreReportProps) {
  const [status, setStatus] = useState<SaveStatus>('saving');
  const [attempt, setAttempt] = useState(0);
  const [showBoard, setShowBoard] = useState(false);
  const payloadRef = useRef(payload);
  const sentAttemptRef = useRef<number | null>(null);
  const aliveRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Una sola petición por intento; StrictMode no la repite.
    if (sentAttemptRef.current === attempt) return;
    sentAttemptRef.current = attempt;
    setStatus('saving');
    submitGameScore(payloadRef.current).then((result) => {
      if (aliveRef.current) setStatus(result.ok ? 'saved' : 'error');
    });
  }, [attempt]);

  return (
    <div className="score-report">
      <div className={`save-status save-${status}`} role="status">
        {status === 'saving' && <span>Guardando resultado...</span>}
        {status === 'saved' && <span>✅ Resultado guardado</span>}
        {status === 'error' && (
          <>
            <span>⚠️ No fue posible guardar el resultado. Tu partida sigue disponible localmente.</span>
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </button>
          </>
        )}
      </div>

      <button type="button" className="ui-btn ui-btn-ghost" aria-expanded={showBoard} onClick={() => setShowBoard((v) => !v)}>
        {showBoard ? 'Ocultar clasificación' : '🏆 Ver clasificación'}
      </button>

      {showBoard && <Leaderboard slug={payload.game_slug} difficulty={payload.difficulty} />}
    </div>
  );
}
