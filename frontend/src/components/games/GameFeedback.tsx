import { useEffect, useState } from 'react';
import '../styles/GameFeedback.css';

interface FloatingTextProps {
  text: string;
  x: number;
  y: number;
  color: 'success' | 'error';
  duration?: number;
}

export function FloatingText({ text, x, y, color, duration = 800 }: FloatingTextProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div
      className={`floating-text floating-${color}`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      {text}
    </div>
  );
}

interface ComboDisplayProps {
  combo: number;
  show: boolean;
}

export function ComboDisplay({ combo, show }: ComboDisplayProps) {
  if (!show || combo < 3) return null;

  const getComboMultiplier = (c: number): number => {
    if (c >= 10) return 4;
    if (c >= 6) return 3;
    if (c >= 3) return 2;
    return 1;
  };

  const multiplier = getComboMultiplier(combo);

  return (
    <div className="combo-display">
      <div className="combo-content">
        <div className="combo-fire">🔥</div>
        <div className="combo-text">
          COMBO <span className="combo-number">x{multiplier}</span>
        </div>
      </div>
    </div>
  );
}

interface PowerUpIndicatorProps {
  powerUp: string | null;
  duration: number;
}

export function PowerUpIndicator({ powerUp, duration }: PowerUpIndicatorProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!powerUp) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, (1 - elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [powerUp, duration]);

  if (!powerUp) return null;

  return (
    <div className="power-up-indicator">
      <div className="power-up-icon">
        {powerUp}
      </div>
      <div className="power-up-bar">
        <div
          className="power-up-progress"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

interface FinalRoundProps {
  show: boolean;
  timeLeft: number;
}

export function FinalRound({ show, timeLeft }: FinalRoundProps) {
  if (!show || timeLeft > 5) return null;

  return (
    <div className="final-round-banner">
      <div className="final-round-content">
        🔥 ¡RONDA FINAL! 🔥
      </div>
    </div>
  );
}

interface GameMessageProps {
  message: string;
  type: 'success' | 'warning' | 'error';
  duration?: number;
}

export function GameMessage({ message, type, duration = 1200 }: GameMessageProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div className={`game-message game-message-${type}`}>
      {message}
    </div>
  );
}
