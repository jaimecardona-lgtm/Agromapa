import { ReactNode } from 'react';
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
  onQuit: () => void;
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
  onQuit,
}: GameResultProps) {
  const percentage = maxScore ? Math.round((score / maxScore) * 100) : 0;

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

      {children}

      <div className="result-buttons">
        <button className="btn-restart" onClick={onRestart}>
          🔄 Jugar de nuevo
        </button>
        <button className="btn-quit" onClick={onQuit}>
          ← Volver
        </button>
      </div>
    </div>
  );
}
