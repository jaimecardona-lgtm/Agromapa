import { ReactNode } from 'react';
import { GameScorePayload } from '@/services/gameScores';
import { useAuth } from '@/auth/AuthContext';
import { AuthPrompt } from '../auth/AuthPrompt';
import { RankingSnapshot } from './RankingSnapshot';
import { ScoreReport } from './ScoreReport';
import '../styles/GameResult.css';

export interface StatItem {
  label: string;
  value: string | number;
}

export interface RatingBadge {
  icon: string;
  label: string;
}

interface GameResultProps {
  title: string;
  score: number;
  maxScore?: number;
  message?: string;
  icon?: string;
  rating?: RatingBadge;
  stats?: StatItem[];
  children?: ReactNode;
  onRestart: () => void;
  onChangeDifficulty?: () => void;
  onQuit: () => void;
  /** Si se envía, la partida se guarda en el backend y se muestra la clasificación. */
  scoreReport?: GameScorePayload;
}

export function GameResult({
  title,
  score,
  maxScore,
  message,
  icon,
  rating,
  stats,
  children,
  onRestart,
  onChangeDifficulty,
  onQuit,
  scoreReport,
}: GameResultProps) {
  const percentage = maxScore ? Math.round((score / maxScore) * 100) : 0;
  const { configured, status } = useAuth();
  // Invitados con partida guardada: se ofrece la cuenta sin bloquear el juego.
  const showAccountCta = Boolean(scoreReport) && configured && status === 'anonymous';

  return (
    <div className="game-result">
      {icon && <div className="result-icon">{icon}</div>}
      <h2>{title}</h2>
      {message && <p className="result-message">{message}</p>}

      <div className="result-score">
        <div className="score-display">
          <span className="score-number">{score}</span>
          {maxScore && <span className="score-max">/ {maxScore}</span>}
        </div>
        {maxScore && (
          <div className="score-percentage">
            <div className="percentage-bar">
              <div className="percentage-fill" style={{ width: `${percentage}%` }}></div>
            </div>
            <span className="percentage-text">{percentage}%</span>
          </div>
        )}
      </div>

      {rating && (
        <div className="result-rating">
          <div className="rating-icon">{rating.icon}</div>
          <div className="rating-label">{rating.label}</div>
        </div>
      )}

      {stats && stats.length > 0 && (
        <div className="result-stats">
          {stats.map((stat, idx) => (
            <div key={idx} className="stat-item">
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {scoreReport && <ScoreReport payload={scoreReport} />}
      {scoreReport && <RankingSnapshot gameSlug={scoreReport.game_slug} score={score} />}

      {showAccountCta && (
        <AuthPrompt
          message="¿Quieres guardar tu puntaje y competir con otros jugadores? Regístrate."
          defaultChoice="buyer"
        />
      )}

      {children}

      <div className="result-buttons">
        <button className="btn-restart" onClick={onRestart}>
          🔄 Jugar otra vez
        </button>
        {onChangeDifficulty && (
          <button className="btn-restart" onClick={onChangeDifficulty}>
            🎚️ Cambiar dificultad
          </button>
        )}
        <button className="btn-quit" onClick={onQuit}>
          ← Volver
        </button>
      </div>
    </div>
  );
}
