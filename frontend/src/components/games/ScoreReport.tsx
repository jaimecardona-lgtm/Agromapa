import { useEffect, useRef, useState } from 'react';
import { getPlayerAlias, getPlayerId, GameScorePayload, submitGameScore } from '@/services/gameScores';
import { AuthPrompt } from '../auth/AuthPrompt';
import { Leaderboard } from './Leaderboard';

interface ScoreReportProps {
  payload: GameScorePayload;
}

type SaveStatus = 'saving' | 'saved' | 'error' | 'expired';

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Inicia sesión para guardar este resultado.';

/**
 * Guarda la partida al terminar y muestra su estado. No bloquea la pantalla de
 * resultados. Si la sesión venció, la partida se conserva con su mismo player_id:
 * nunca se reenvía como invitado con otra identidad.
 */
export function ScoreReport({ payload }: ScoreReportProps) {
  const [status, setStatus] = useState<SaveStatus>('saving');
  const [attempt, setAttempt] = useState(0);
  const [showBoard, setShowBoard] = useState(false);
  const payloadRef = useRef(payload);
  const identityRef = useRef<{ playerId: string; alias: string } | null>(null);
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
    // La identidad de invitado se fija en el primer intento y se reutiliza en los reintentos.
    if (!identityRef.current) identityRef.current = { playerId: getPlayerId(), alias: getPlayerAlias() };
    setStatus('saving');
    submitGameScore(payloadRef.current, identityRef.current).then((result) => {
      if (!aliveRef.current) return;
      if (result.ok) setStatus('saved');
      else if (result.reason === 'session_expired') setStatus('expired');
      else setStatus('error');
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
        {status === 'expired' && (
          <>
            <span>{SESSION_EXPIRED_MESSAGE}</span>
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar guardado
            </button>
          </>
        )}
      </div>

      {status === 'expired' && (
        <AuthPrompt
          message="Tu partida se conserva en este navegador hasta que la guardes en tu cuenta."
          defaultChoice="buyer"
          onAuthenticated={() => setAttempt((n) => n + 1)}
        />
      )}

      <button type="button" className="ui-btn ui-btn-ghost" aria-expanded={showBoard} onClick={() => setShowBoard((v) => !v)}>
        {showBoard ? 'Ocultar clasificación' : '🏆 Ver clasificación'}
      </button>

      {showBoard && <Leaderboard slug={payload.game_slug} difficulty={payload.difficulty} />}
    </div>
  );
}
