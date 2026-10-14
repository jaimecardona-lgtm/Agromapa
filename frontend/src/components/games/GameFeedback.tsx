import { useEffect, useState } from 'react';
import '../styles/GameFeedback.css';

interface FloatingTextProps {
  text: string;
  /** Posición horizontal dentro del contenedor, en porcentaje (0-100). */
  x: number;
  /** Posición vertical dentro del contenedor, en porcentaje (0-100). */
  y: number;
  color: 'success' | 'error';
  duration?: number;
}

export function FloatingText({ text, x, y, color, duration = 900 }: FloatingTextProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div
      className={`floating-text floating-${color}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {text}
    </div>
  );
}

interface FlashOverlayProps {
  tone: 'catch' | 'hit' | 'shield' | 'power';
}

/** Destello de pantalla. Se monta de nuevo con `key` por evento para reiniciar la animación. */
export function FlashOverlay({ tone }: FlashOverlayProps) {
  return <div className={`flash-overlay flash-${tone}`} aria-hidden="true" />;
}

interface ComboDisplayProps {
  combo: number;
  multiplier: number;
}

export function ComboDisplay({ combo, multiplier }: ComboDisplayProps) {
  if (combo < 3) return null;

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

export interface ActiveEffect {
  type: string;
  icon: string;
  name: string;
  remainingMs: number;
  totalMs: number;
}

interface EffectIndicatorProps {
  effects: ActiveEffect[];
}

export function EffectIndicator({ effects }: EffectIndicatorProps) {
  if (effects.length === 0) return null;

  return (
    <div className="effect-indicator" aria-live="polite">
      {effects.map((effect) => (
        <div key={effect.type} className="effect-chip" title={effect.name}>
          <span className="effect-icon">{effect.icon}</span>
          <span className="effect-name">{effect.name}</span>
          <span className="effect-bar">
            <span
              className="effect-progress"
              style={{ width: `${Math.max(0, Math.min(100, (effect.remainingMs / effect.totalMs) * 100))}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

interface FinalRoundProps {
  show: boolean;
}

export function FinalRound({ show }: FinalRoundProps) {
  if (!show) return null;

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
  type: 'success' | 'warning' | 'error' | 'info';
  duration?: number;
}

/** Mensaje breve. Se monta de nuevo con `key` por evento para mostrarse siempre. */
export function GameMessage({ message, type, duration = 1200 }: GameMessageProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div className={`game-message game-message-${type}`} role="status">
      {message}
    </div>
  );
}
