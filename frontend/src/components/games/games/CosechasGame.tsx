import { useState, useEffect, useRef, useCallback } from 'react';
import { GameShell } from '../GameShell';
import { GameResult } from '../GameResult';
import { FloatingText, ComboDisplay, EffectIndicator, FinalRound, FlashOverlay, GameMessage, ActiveEffect } from '../GameFeedback';
import { POWER_UPS, PowerUpType } from '@/data/powerUps';
import { setBestScore } from '@/utils/bestScores';
import '../../styles/games/CosechasGame.css';
import {
  CosechasState,
  FINAL_ROUND_MS,
  GAME_DURATION,
  MAGNET_RADIUS,
  GAME_WIDTH,
  GAME_HEIGHT,
  SPAWN_MS,
  SUPER_BASKET_SCALE,
  TICK_MS,
  clampBasket,
  comboMultiplier,
  createInitialState,
  getRating,
  isEffectActive,
  spawnItem,
  stepGame,
} from './cosechasEngine';

type Phase = 'start' | 'countdown' | 'playing' | 'ended';

const KEYS_LEFT = ['arrowleft', 'a'];
const KEYS_RIGHT = ['arrowright', 'd'];
const MOVE_KEYS = [...KEYS_LEFT, ...KEYS_RIGHT];

function activeEffects(state: CosechasState): ActiveEffect[] {
  return (Object.keys(POWER_UPS) as PowerUpType[])
    .filter((type) => type !== 'time' && isEffectActive(state, type))
    .map((type) => {
      const config = POWER_UPS[type];
      const expiresAt = state.effects[type] ?? 0;
      return {
        type,
        icon: config.icon,
        name: config.name,
        remainingMs: expiresAt - state.elapsed,
        totalMs: config.duration,
      };
    });
}

export function CosechasGame({ onQuit }: { onQuit: () => void }) {
  const [phase, setPhase] = useState<Phase>('start');
  const [countdown, setCountdown] = useState(3);
  const [state, setState] = useState<CosechasState>(createInitialState);

  const gameContainerRef = useRef<HTMLDivElement>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());

  // Teclado: se leen las teclas fuera del updater para que el estado siga siendo puro.
  useEffect(() => {
    const isMoveKey = (key: string) => MOVE_KEYS.includes(key.toLowerCase());

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isMoveKey(e.key)) {
        pressedKeysRef.current.add(e.key.toLowerCase());
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isMoveKey(e.key)) pressedKeysRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mouse y touch: la canasta sigue la posición horizontal del puntero.
  useEffect(() => {
    const moveTo = (clientX: number) => {
      if (!gameContainerRef.current) return;
      const rect = gameContainerRef.current.getBoundingClientRect();
      const percentX = ((clientX - rect.left) / rect.width) * 100;
      setState((prev) => (prev.gameActive ? { ...prev, basketX: clampBasket(percentX) } : prev));
    };

    const handleMouseMove = (e: MouseEvent) => moveTo(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) moveTo(e.touches[0].clientX);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  const readKeyboardDirection = useCallback((): -1 | 0 | 1 => {
    const keys = pressedKeysRef.current;
    const left = KEYS_LEFT.some((k) => keys.has(k));
    const right = KEYS_RIGHT.some((k) => keys.has(k));
    if (left === right) return 0;
    return left ? -1 : 1;
  }, []);

  // Bucle principal del juego (un tick por TICK_MS).
  useEffect(() => {
    if (!state.gameActive) return;

    const id = setInterval(() => {
      const dir = readKeyboardDirection();
      setState((prev) => stepGame(prev, dir));
    }, TICK_MS);

    return () => clearInterval(id);
  }, [state.gameActive, readKeyboardDirection]);

  // Aparición de cultivos, obstáculos y power-ups.
  useEffect(() => {
    if (!state.gameActive) return;

    const id = setInterval(() => {
      setState((prev) => spawnItem(prev, Math.random));
    }, SPAWN_MS);

    return () => clearInterval(id);
  }, [state.gameActive]);

  // Cuenta regresiva antes de empezar.
  useEffect(() => {
    if (phase !== 'countdown') return;

    if (countdown === 0) {
      setState((prev) => ({ ...prev, gameActive: true }));
      setPhase('playing');
      return;
    }

    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  // Fin de partida: guarda el mejor puntaje una sola vez.
  useEffect(() => {
    if (phase === 'playing' && !state.gameActive && state.timeLeft === 0) {
      setBestScore('cosechas', state.score);
      setPhase('ended');
    }
  }, [phase, state.gameActive, state.timeLeft, state.score]);

  const handleStart = () => {
    setCountdown(3);
    setPhase('countdown');
  };

  const handleRestart = () => {
    setState(createInitialState());
    setCountdown(3);
    setPhase('start');
  };

  if (phase === 'start') {
    return (
      <div className="cosechas-start-screen">
        <div className="start-content">
          <div className="start-icon">🌾</div>
          <h2>Cosechas</h2>
          <p>Recolecta cultivos y evita obstáculos</p>
          <div className="controls-info">
            <div>⌨️ Flechas ← → o A/D</div>
            <div>🖱️ Mueve el mouse</div>
            <div>📱 Arrastra o usa botones</div>
          </div>
          <button className="start-btn" onClick={handleStart}>
            JUGAR
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'countdown') {
    return (
      <div className="cosechas-countdown">
        <div className="countdown-number" key={countdown}>{countdown}</div>
      </div>
    );
  }

  if (phase === 'ended') {
    const rating = getRating(state.score);
    return (
      <GameResult
        score={state.score}
        title="Cosechas"
        onRestart={handleRestart}
        onQuit={onQuit}
        rating={rating}
        scoreReport={{
          game_slug: 'cosechas',
          difficulty: null,
          score: state.score,
          duration_seconds: Math.round(state.elapsed / 1000),
          metadata: {
            crops_collected: state.cropsCollected,
            obstacles_hit: state.obstaclesHit,
            best_combo: state.bestCombo,
            shields_used: state.shieldsUsed,
          },
        }}
        stats={[
          { label: 'Cultivos Recolectados', value: state.cropsCollected },
          { label: 'Obstáculos Golpeados', value: state.obstaclesHit },
          { label: 'Escudos Usados', value: state.shieldsUsed },
          { label: 'Mejor Combo', value: `x${state.bestCombo}` },
        ]}
      />
    );
  }

  const basketScale = isEffectActive(state, 'basket') ? SUPER_BASKET_SCALE : 1;
  const magnetOn = isEffectActive(state, 'magnet');
  const multiplier = comboMultiplier(state.combo);
  const lastFeedback = state.feedback;
  const bounceKey = state.flash?.tone === "catch" ? state.flash.id : 0;

  return (
    <GameShell title="🌾 Cosechas" onQuit={onQuit} score={state.score} timeLeft={state.timeLeft / 1000} maxTime={GAME_DURATION / 1000}>
      <div
        ref={gameContainerRef}
        className={`cosechas-game ${state.shakeUntil > state.elapsed ? 'shake' : ''}`}
      >
        {magnetOn && (
          <div
            className="magnet-field"
            style={{ left: `${state.basketX}%`, width: `${((MAGNET_RADIUS * 2) / GAME_WIDTH) * 100}%` }}
            aria-hidden="true"
          />
        )}

        {state.items.map((item) => (
          <div
            key={item.id}
            className={`game-item game-item-${item.type}`}
            style={{
              left: `${(item.x / GAME_WIDTH) * 100}%`,
              top: `${(item.y / GAME_HEIGHT) * 100}%`,
            }}
          >
            {item.emoji}
          </div>
        ))}

        <div
          className={`basket ${isEffectActive(state, 'basket') ? 'basket-super' : ''}`}
          style={{ left: `${state.basketX}%`, transform: `translateX(-50%) scale(${basketScale})` }}
        >
          <span key={bounceKey} className={bounceKey ? "basket-icon basket-bounce" : "basket-icon"}>🧺</span>
        </div>

        {state.flash && <FlashOverlay key={state.flash.id} tone={state.flash.tone} />}

        <ComboDisplay combo={state.combo} multiplier={multiplier} />
        <EffectIndicator effects={activeEffects(state)} />
        <FinalRound show={state.timeLeft <= FINAL_ROUND_MS} />

        {state.floatingScores.map((f) => (
          <FloatingText
            key={f.id}
            text={f.text}
            x={(f.x / GAME_WIDTH) * 100}
            y={(f.y / GAME_HEIGHT) * 100}
            color={f.tone}
          />
        ))}

        {lastFeedback && <GameMessage key={lastFeedback.id} message={lastFeedback.text} type={lastFeedback.tone} duration={1200} />}

        <div className="mobile-controls">
          <button onClick={() => setState((prev) => ({ ...prev, basketX: clampBasket(prev.basketX - 5) }))}>⬅️</button>
          <button onClick={() => setState((prev) => ({ ...prev, basketX: clampBasket(prev.basketX + 5) }))}>➡️</button>
        </div>
      </div>
    </GameShell>
  );
}
