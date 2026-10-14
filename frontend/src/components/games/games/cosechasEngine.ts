import { POWER_UPS, PowerUpType, getRandomPowerUp } from '@/data/powerUps';

// Motor puro del juego Cosechas. No usa React ni timers: cada tick recibe
// el estado anterior y devuelve el siguiente, para poder probar las reglas.

export const CROPS = ['🌾', '🌽', '🥔', '🥬', '🥕'];
export const OBSTACLES = ['🪨', '💨', '🐛'];

export const GAME_DURATION = 30000;
export const TICK_MS = 16;
export const SPAWN_MS = 400;
export const GAME_WIDTH = 400;
export const GAME_HEIGHT = 500;
const BASKET_TOP = GAME_HEIGHT - 50;
const ITEM_HALF_SIZE = 20;

export const BASKET_HALF_WIDTH = 30; // px; con el margen del ítem la zona de captura base es 50px (igual que antes)
export const SUPER_BASKET_SCALE = 1.6; // la zona de captura y el dibujo crecen juntos
const BASKET_SPEED = 2; // % por tick

export const CATCH_POINTS = 10;
export const OBSTACLE_PENALTY = 5;
export const EXTRA_TIME_MS = 5000;
export const FINAL_ROUND_MS = 5000;
export const MAX_COMBO_MULTIPLIER = 3;

export const MAGNET_RADIUS = 140; // px alrededor de la canasta
export const MAGNET_PULL = 0.35; // cambio de velocidad lateral por tick
export const MAX_DRIFT = 4; // velocidad lateral máxima (px por tick)

export const FLOATING_LIFETIME_MS = 900;
export const SHAKE_MS = 400;

export type FlashTone = 'catch' | 'hit' | 'shield' | 'power';

export interface GameItem {
  id: number;
  emoji: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: 'crop' | 'obstacle' | 'powerup';
  powerUpType?: PowerUpType;
}

export interface FloatingScore {
  id: number;
  text: string;
  x: number;
  y: number;
  tone: 'success' | 'error';
  createdAt: number;
}

export interface Feedback {
  id: number;
  text: string;
  tone: 'success' | 'warning' | 'info';
}

export interface Flash {
  id: number;
  tone: FlashTone;
}

export interface CosechasState {
  score: number;
  timeLeft: number;
  elapsed: number;
  combo: number;
  bestCombo: number;
  cropsCollected: number;
  obstaclesHit: number;
  shieldsUsed: number;
  gameActive: boolean;
  basketX: number;
  items: GameItem[];
  /** Instante (en tiempo de juego, ms) en que termina cada efecto de power-up. */
  effects: Partial<Record<PowerUpType, number>>;
  floatingScores: FloatingScore[];
  feedback: Feedback | null;
  flash: Flash | null;
  shakeUntil: number;
  nextId: number;
}

export function createInitialState(): CosechasState {
  return {
    score: 0,
    timeLeft: GAME_DURATION,
    elapsed: 0,
    combo: 0,
    bestCombo: 0,
    cropsCollected: 0,
    obstaclesHit: 0,
    shieldsUsed: 0,
    gameActive: false,
    basketX: 50,
    items: [],
    effects: {},
    floatingScores: [],
    feedback: null,
    flash: null,
    shakeUntil: 0,
    nextId: 1,
  };
}

export function clampBasket(percent: number): number {
  return Math.max(5, Math.min(95, percent));
}

export function comboMultiplier(combo: number): number {
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

/** Puntos de una cosecha. Doble cosecha duplica solo esta cifra positiva. */
export function catchPoints(combo: number, doubleActive: boolean): number {
  return CATCH_POINTS * comboMultiplier(combo) * (doubleActive ? 2 : 1);
}

export function getRating(score: number): { icon: string; label: string } {
  if (score >= 500) return { icon: '🏆', label: 'Maestro de la Cosecha' };
  if (score >= 350) return { icon: '🌾', label: 'Experto' };
  if (score >= 200) return { icon: '🌿', label: 'Agricultor' };
  return { icon: '🌱', label: 'Aprendiz' };
}

export function isEffectActive(state: CosechasState, type: PowerUpType): boolean {
  const expiresAt = state.effects[type];
  return expiresAt !== undefined && expiresAt > state.elapsed;
}

/** Se mantiene el mismo rango de aparición que antes (más rápido con el tiempo). */
export function speedFactor(timeLeft: number): number {
  return 1 + ((GAME_DURATION - timeLeft) / GAME_DURATION) * 0.5;
}

/** Crea un ítem nuevo usando `rand` para que sea determinista en pruebas. */
export function spawnItem(state: CosechasState, rand: () => number): CosechasState {
  if (!state.gameActive) return state;

  const speed = speedFactor(state.timeLeft);
  const roll = rand();
  const id = state.nextId;
  let emoji: string;
  let type: GameItem['type'];
  let powerUpType: PowerUpType | undefined;

  if (roll < 0.7) {
    emoji = CROPS[Math.floor(rand() * CROPS.length)];
    type = 'crop';
  } else if (roll < 0.85) {
    emoji = OBSTACLES[Math.floor(rand() * OBSTACLES.length)];
    type = 'obstacle';
  } else {
    const powerUp = getRandomPowerUp(rand);
    if (powerUp) {
      emoji = POWER_UPS[powerUp].icon;
      type = 'powerup';
      powerUpType = powerUp;
    } else {
      emoji = CROPS[Math.floor(rand() * CROPS.length)];
      type = 'crop';
    }
  }

  const item: GameItem = {
    id,
    emoji,
    x: rand() * (GAME_WIDTH - 40) + 20,
    y: -40,
    vx: (rand() - 0.5) * 2 * speed,
    vy: 2 + rand() * speed,
    type,
    powerUpType,
  };

  return { ...state, nextId: id + 1, items: [...state.items, item] };
}

/** Avanza el juego un tick. `dir` es la dirección de teclado de la canasta. */
export function stepGame(prev: CosechasState, dir: -1 | 0 | 1): CosechasState {
  if (!prev.gameActive) return prev;

  const elapsed = prev.elapsed + TICK_MS;
  const timeLeft = Math.max(0, prev.timeLeft - TICK_MS);

  // Efectos vencidos se eliminan; los activos siguen.
  const effects: CosechasState['effects'] = {};
  (Object.keys(prev.effects) as PowerUpType[]).forEach((type) => {
    const expiresAt = prev.effects[type];
    if (expiresAt !== undefined && expiresAt > elapsed) effects[type] = expiresAt;
  });
  const isActive = (type: PowerUpType) => effects[type] !== undefined;

  const basketX = clampBasket(prev.basketX + dir * BASKET_SPEED);
  const basketCenter = (basketX / 100) * GAME_WIDTH;
  const halfWidth = BASKET_HALF_WIDTH * (isActive('basket') ? SUPER_BASKET_SCALE : 1);
  const magnetOn = isActive('magnet');

  // Movimiento: el imán curva gradualmente la trayectoria de los cultivos cercanos.
  const moved = prev.items.map((item) => {
    let vx = item.vx;
    if (magnetOn && item.type === 'crop' && item.y < BASKET_TOP) {
      const dx = basketCenter - item.x;
      if (Math.abs(dx) < MAGNET_RADIUS && dx !== 0) {
        vx = Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, vx + Math.sign(dx) * MAGNET_PULL));
      }
    }
    return { ...item, vx, x: item.x + vx, y: item.y + item.vy };
  });

  let score = prev.score;
  let combo = prev.combo;
  let bestCombo = prev.bestCombo;
  let cropsCollected = prev.cropsCollected;
  let obstaclesHit = prev.obstaclesHit;
  let shieldsUsed = prev.shieldsUsed;
  let timeLeftNow = timeLeft;
  let feedback = prev.feedback;
  let flash = prev.flash;
  let shakeUntil = prev.shakeUntil;
  let nextId = prev.nextId;
  const floatingScores = prev.floatingScores.filter((f) => elapsed - f.createdAt < FLOATING_LIFETIME_MS);
  const remaining: GameItem[] = [];

  const feedbackTo = (text: string, tone: Feedback['tone']) => {
    feedback = { id: nextId++, text, tone };
  };
  const flashTo = (tone: FlashTone) => {
    flash = { id: nextId++, tone };
  };

  for (const item of moved) {
    const caught = item.y + ITEM_HALF_SIZE + 10 >= BASKET_TOP && Math.abs(item.x - basketCenter) < halfWidth + ITEM_HALF_SIZE;

    if (!caught) {
      if (item.y <= GAME_HEIGHT) remaining.push(item);
      continue;
    }

    const floatY = Math.min(item.y, BASKET_TOP);

    if (item.type === 'crop') {
      const points = catchPoints(combo, isActive('double'));
      score += points;
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
      cropsCollected += 1;
      floatingScores.push({ id: nextId++, text: `+${points}`, x: item.x, y: floatY, tone: 'success', createdAt: elapsed });
      feedbackTo('¡Buena cosecha!', 'success');
      flashTo('catch');
    } else if (item.type === 'obstacle') {
      if (isActive('shield')) {
        delete effects.shield;
        shieldsUsed += 1;
        feedbackTo('🛡️ Escudo utilizado', 'info');
        flashTo('shield');
      } else {
        score = Math.max(0, score - OBSTACLE_PENALTY);
        combo = 0;
        obstaclesHit += 1;
        floatingScores.push({ id: nextId++, text: `-${OBSTACLE_PENALTY}`, x: item.x, y: floatY, tone: 'error', createdAt: elapsed });
        feedbackTo('¡Cuidado!', 'warning');
        flashTo('hit');
        shakeUntil = elapsed + SHAKE_MS;
      }
    } else if (item.powerUpType) {
      const type = item.powerUpType;
      const config = POWER_UPS[type];
      if (type === 'time') {
        timeLeftNow += EXTRA_TIME_MS;
        feedbackTo(`${config.icon} +5 segundos`, 'success');
      } else {
        // Cada power-up tiene su propio temporizador; recogerlo de nuevo lo reinicia.
        effects[type] = elapsed + config.duration;
        feedbackTo(`${config.icon} ${config.name} activo`, 'info');
      }
      flashTo('power');
    }
  }

  const ended = timeLeftNow <= 0;

  return {
    ...prev,
    elapsed,
    timeLeft: timeLeftNow,
    gameActive: !ended,
    basketX,
    items: ended ? [] : remaining,
    effects,
    floatingScores,
    feedback,
    flash,
    shakeUntil,
    score,
    combo,
    bestCombo,
    cropsCollected,
    obstaclesHit,
    shieldsUsed,
    nextId,
  };
}
