import { ReactNode } from 'react';
import '../styles/GameShell.css';

interface GameShellProps {
  title: string;
  description?: string;
  score?: number;
  timeLeft?: number;
  maxTime?: number;
  children: ReactNode;
  onQuit?: () => void;
}

export function GameShell({ title, description, score, timeLeft, maxTime, children, onQuit }: GameShellProps) {
  const timeProgress = maxTime && timeLeft !== undefined ? Math.min(100, Math.max(0, (timeLeft / maxTime) * 100)) : 100;

  return (
    <div className="game-shell">
      <div className="game-header">
        <div className="game-info">
          <h2>{title}</h2>
          {description && <p className="game-description">{description}</p>}
        </div>
        {onQuit && (
          <button className="game-quit-btn" onClick={onQuit} title="Volver">✕</button>
        )}
      </div>

      <div className="game-stats">
        {score !== undefined && (
          <div className="stat-item">
            <span className="stat-label">Puntos:</span>
            <span className="stat-value">{score}</span>
          </div>
        )}
        {timeLeft !== undefined && (
          <div className="stat-item">
            <span className="stat-label">Tiempo:</span>
            <span className="stat-value">{Math.ceil(timeLeft)}s</span>
            {maxTime && (
              <div className="time-progress">
                <div className="time-bar" style={{ width: `${timeProgress}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="game-content">
        {children}
      </div>
    </div>
  );
}
