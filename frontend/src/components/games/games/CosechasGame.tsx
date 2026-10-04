import { useState, useEffect, useRef, useCallback } from 'react';
import { GameShell } from '../GameShell';
import { GameResult } from '../GameResult';
import { FloatingText, ComboDisplay, PowerUpIndicator, FinalRound, GameMessage } from '../GameFeedback';
import { getRandomPowerUp, POWER_UPS, PowerUpType } from '@/data/powerUps';
import { setBestScore } from '@/utils/bestScores';
import '../../styles/games/CosechasGame.css';

const CROPS = ['🌾', '🌽', '🥔', '🥬', '🥕'];
const OBSTACLES = ['🪨', '💨', '🐛'];
const GAME_DURATION = 30000;
const BASKET_WIDTH = 60;
const GAME_WIDTH = 400;
const GAME_HEIGHT = 500;

interface GameItem {
  id: string;
  emoji: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: 'crop' | 'obstacle' | 'powerup';
  powerUpType?: PowerUpType;
}

interface GameState {
  score: number;
  timeLeft: number;
  combo: number;
  bestCombo: number;
  cropsCollected: number;
  obstaclesHit: number;
  gameActive: boolean;
  gameStarted: boolean;
  items: GameItem[];
  floatingTexts: Array<{ id: string; text: string; x: number; y: number; color: 'success' | 'error' }>;
  messages: Array<{ id: string; text: string; type: 'success' | 'warning' | 'error' }>;
  activePowerUp: PowerUpType | null;
  powerUpEndTime: number;
  shieldActive: boolean;
  doubleActive: boolean;
  shakeActive: boolean;
}

export function CosechasGame({ onQuit }: { onQuit: () => void }) {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    timeLeft: GAME_DURATION,
    combo: 0,
    bestCombo: 0,
    cropsCollected: 0,
    obstaclesHit: 0,
    gameActive: false,
    gameStarted: false,
    items: [],
    floatingTexts: [],
    messages: [],
    activePowerUp: null,
    powerUpEndTime: 0,
    shieldActive: false,
    doubleActive: false,
    shakeActive: false,
  });

  const [basketPos, setBasketPos] = useState(50);
  const [countdownStart, setCountdownStart] = useState(0);
  const [gameEnded, setGameEnded] = useState(false);

  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());

  const getRating = (score: number): { icon: string; label: string } => {
    if (score >= 500) return { icon: '🏆', label: 'Maestro de la Cosecha' };
    if (score >= 350) return { icon: '🌾', label: 'Experto' };
    if (score >= 200) return { icon: '🌿', label: 'Agricultor' };
    return { icon: '🌱', label: 'Aprendiz' };
  };

  const getComboMultiplier = (combo: number): number => {
    if (combo >= 10) return 4;
    if (combo >= 6) return 3;
    if (combo >= 3) return 2;
    return 1;
  };

  const clampPosition = (pos: number): number => {
    return Math.max(5, Math.min(95, pos));
  };

  const addScore = useCallback((points: number, x: number, y: number, success: boolean) => {
    if (!success && points < 0) {
      setGameState((prev) => {
        const newScore = Math.max(0, prev.score + points);
        const floatingId = `float-${Date.now()}-${Math.random()}`;
        const messageId = `msg-${Date.now()}`;

        return {
          ...prev,
          score: newScore,
          combo: 0,
          obstaclesHit: prev.obstaclesHit + 1,
          floatingTexts: [...prev.floatingTexts, { id: floatingId, text: `${points}`, x, y, color: 'error' }],
          messages: [...prev.messages, { id: messageId, text: '¡Cuidado!', type: 'warning' }],
          shakeActive: true,
        };
      });
    } else if (success) {
      setGameState((prev) => {
        const multiplier = getComboMultiplier(prev.combo);
        let basePoints = points;
        if (prev.timeLeft <= 5000) basePoints *= 2;

        const finalPoints = Math.floor(basePoints * multiplier);
        const powerUpMultiplier = prev.doubleActive ? 2 : 1;
        const totalPoints = Math.floor(finalPoints * powerUpMultiplier);

        const newCombo = prev.combo + 1;
        const newBestCombo = Math.max(prev.bestCombo, newCombo);

        const floatingId = `float-${Date.now()}-${Math.random()}`;
        const messageId = `msg-${Date.now()}`;

        return {
          ...prev,
          score: prev.score + totalPoints,
          combo: newCombo,
          bestCombo: newBestCombo,
          cropsCollected: prev.cropsCollected + 1,
          floatingTexts: [...prev.floatingTexts, { id: floatingId, text: `+${totalPoints}`, x, y, color: 'success' }],
          messages: [...prev.messages, { id: messageId, text: '¡Buena cosecha!', type: 'success' }],
        };
      });
    }
  }, []);

  const handlePowerUpCollect = useCallback((powerUpType: PowerUpType) => {
    setGameState((prev) => {
      const newState = { ...prev, activePowerUp: powerUpType, powerUpEndTime: Date.now() + POWER_UPS[powerUpType].duration };

      if (powerUpType === 'time') {
        newState.timeLeft = prev.timeLeft + 5000;
      } else if (powerUpType === 'double') {
        newState.doubleActive = true;
      } else if (powerUpType === 'shield') {
        newState.shieldActive = true;
      }

      return newState;
    });
  }, []);

  const spawnItem = useCallback(() => {
    setGameState((prev) => {
      if (!prev.gameActive) return prev;

      const speedMultiplier = 1 + (GAME_DURATION - prev.timeLeft) / GAME_DURATION * 0.5;
      const roll = Math.random();
      let emoji = '';
      let type: 'crop' | 'obstacle' | 'powerup' = 'crop';
      let powerUpType: PowerUpType | undefined;

      if (roll < 0.7) {
        emoji = CROPS[Math.floor(Math.random() * CROPS.length)];
        type = 'crop';
      } else if (roll < 0.85) {
        emoji = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
        type = 'obstacle';
      } else {
        const powerUp = getRandomPowerUp();
        if (powerUp) {
          emoji = POWER_UPS[powerUp].icon;
          type = 'powerup';
          powerUpType = powerUp;
        } else {
          emoji = CROPS[Math.floor(Math.random() * CROPS.length)];
          type = 'crop';
        }
      }

      const newItem: GameItem = {
        id: `item-${Date.now()}-${Math.random()}`,
        emoji,
        x: Math.random() * (GAME_WIDTH - 40) + 20,
        y: -40,
        vx: (Math.random() - 0.5) * 2 * speedMultiplier,
        vy: 2 + Math.random() * speedMultiplier,
        type,
        powerUpType,
      };

      return { ...prev, items: [...prev.items, newItem] };
    });
  }, []);

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
        pressedKeysRef.current.add(e.key.toLowerCase());
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) {
        pressedKeysRef.current.delete(e.key.toLowerCase());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle mouse movement
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!gameContainerRef.current || !gameState.gameActive) return;

      const rect = gameContainerRef.current.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const percentX = (relX / rect.width) * 100;
      setBasketPos(clampPosition(percentX));
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!gameContainerRef.current || !gameState.gameActive) return;

      const rect = gameContainerRef.current.getBoundingClientRect();
      const relX = e.touches[0].clientX - rect.left;
      const percentX = (relX / rect.width) * 100;
      setBasketPos(clampPosition(percentX));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [gameState.gameActive]);

  // Keyboard continuous movement
  useEffect(() => {
    const movementInterval = setInterval(() => {
      if (!gameState.gameActive) return;

      setBasketPos((pos) => {
        let newPos = pos;
        const speed = 2;

        if (pressedKeysRef.current.has('arrowleft') || pressedKeysRef.current.has('a')) {
          newPos -= speed;
        }
        if (pressedKeysRef.current.has('arrowright') || pressedKeysRef.current.has('d')) {
          newPos += speed;
        }

        return clampPosition(newPos);
      });
    }, 16);

    return () => clearInterval(movementInterval);
  }, [gameState.gameActive]);

  // Game loop
  useEffect(() => {
    const tick = () => {
      setGameState((prev) => {
        if (!prev.gameActive) return prev;

        const newTimeLeft = Math.max(0, prev.timeLeft - 16);
        const isGameEnded = newTimeLeft === 0;

        let newActivePowerUp = prev.activePowerUp;
        let newShieldActive = prev.shieldActive;
        let newDoubleActive = prev.doubleActive;

        if (prev.activePowerUp && Date.now() >= prev.powerUpEndTime) {
          newActivePowerUp = null;
          newDoubleActive = false;
        }

        const basketCenterX = (basketPos / 100) * GAME_WIDTH;

        const updatedItems = prev.items
          .map((item) => ({
            ...item,
            x: item.x + item.vx,
            y: item.y + item.vy,
          }))
          .filter((item) => {
            // Collision detection
            if (item.y + 30 >= GAME_HEIGHT - 50) {
              const distX = Math.abs(item.x - basketCenterX);

              if (distX < BASKET_WIDTH / 2 + 20) {
                if (item.type === 'crop') {
                  addScore(10, item.x, item.y, true);
                } else if (item.type === 'obstacle') {
                  if (newShieldActive) {
                    newShieldActive = false;
                  } else {
                    addScore(-5, item.x, item.y, false);
                  }
                } else if (item.type === 'powerup' && item.powerUpType) {
                  handlePowerUpCollect(item.powerUpType);
                }
                return false;
              }
            }

            return item.y <= GAME_HEIGHT;
          });

        return {
          ...prev,
          timeLeft: newTimeLeft,
          gameActive: !isGameEnded,
          items: updatedItems,
          activePowerUp: newActivePowerUp,
          shieldActive: newShieldActive,
          doubleActive: newDoubleActive,
        };
      });
    };

    gameLoopRef.current = setInterval(tick, 16);
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [addScore, handlePowerUpCollect, basketPos]);

  // Spawn items
  useEffect(() => {
    if (!gameState.gameActive) return;

    const spawnInterval = setInterval(spawnItem, 400);
    return () => clearInterval(spawnInterval);
  }, [gameState.gameActive, spawnItem]);

  // Countdown
  useEffect(() => {
    if (countdownStart === 0 || gameState.gameActive) return;

    const countdownInterval = setInterval(() => {
      setCountdownStart((prev) => {
        if (prev <= 1) {
          setGameState((s) => ({ ...s, gameActive: true, gameStarted: true }));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [countdownStart, gameState.gameActive]);

  // Cleanup floating texts
  useEffect(() => {
    setGameState((prev) => ({
      ...prev,
      floatingTexts: prev.floatingTexts.filter((_, i) => i < 3),
      messages: prev.messages.filter((_, i) => i < 1),
      shakeActive: false,
    }));
  }, [gameState.floatingTexts.length, gameState.messages.length]);

  const handleStart = () => {
    setCountdownStart(3);
  };

  const handleRestart = () => {
    setGameEnded(false);
    setBasketPos(50);
    setCountdownStart(0);
    setGameState({
      score: 0,
      timeLeft: GAME_DURATION,
      combo: 0,
      bestCombo: 0,
      cropsCollected: 0,
      obstaclesHit: 0,
      gameActive: false,
      gameStarted: false,
      items: [],
      floatingTexts: [],
      messages: [],
      activePowerUp: null,
      powerUpEndTime: 0,
      shieldActive: false,
      doubleActive: false,
      shakeActive: false,
    });
  };

  if (!gameState.gameStarted && !gameState.gameActive && countdownStart === 0) {
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

  if (countdownStart > 0 && !gameState.gameActive) {
    return (
      <div className="cosechas-countdown">
        <div className="countdown-number">{countdownStart}</div>
      </div>
    );
  }

  if (!gameState.gameActive && gameState.timeLeft === 0 && !gameEnded) {
    setGameEnded(true);
    setBestScore('cosechas', gameState.score);
  }

  if (gameEnded) {
    const rating = getRating(gameState.score);
    return (
      <GameResult
        score={gameState.score}
        title="Cosechas"
        onRestart={handleRestart}
        onQuit={onQuit}
        rating={rating}
        stats={[
          { label: 'Cultivos Recolectados', value: gameState.cropsCollected },
          { label: 'Obstáculos Golpeados', value: gameState.obstaclesHit },
          { label: 'Mejor Combo', value: `x${gameState.bestCombo}` },
        ]}
      />
    );
  }

  return (
    <GameShell title="🌾 Cosechas" onQuit={onQuit} score={gameState.score} timeLeft={gameState.timeLeft / 1000} maxTime={GAME_DURATION / 1000}>
      <div ref={gameContainerRef} className={`cosechas-game ${gameState.shakeActive ? 'shake' : ''}`}>
        {gameState.items.map((item) => (
          <div
            key={item.id}
            className="game-item"
            style={{
              left: `${(item.x / GAME_WIDTH) * 100}%`,
              top: `${(item.y / GAME_HEIGHT) * 100}%`,
            }}
          >
            {item.emoji}
          </div>
        ))}

        <div className="basket" style={{ left: `${basketPos}%` }}>
          <span className="basket-icon">🧺</span>
        </div>

        <ComboDisplay combo={gameState.combo} show={gameState.combo >= 3} />
        <PowerUpIndicator powerUp={gameState.activePowerUp ? POWER_UPS[gameState.activePowerUp].icon : null} duration={gameState.activePowerUp ? POWER_UPS[gameState.activePowerUp].duration : 0} />
        <FinalRound show={gameState.timeLeft <= 5000} timeLeft={gameState.timeLeft / 1000} />

        {gameState.floatingTexts.map((text) => (
          <FloatingText key={text.id} {...text} duration={800} />
        ))}

        {gameState.messages.map((msg) => (
          <GameMessage key={msg.id} message={msg.text} type={msg.type} duration={1200} />
        ))}

        <div className="mobile-controls">
          <button onClick={() => setBasketPos((p) => clampPosition(p - 5))}>⬅️</button>
          <button onClick={() => setBasketPos((p) => clampPosition(p + 5))}>➡️</button>
        </div>
      </div>
    </GameShell>
  );
}
