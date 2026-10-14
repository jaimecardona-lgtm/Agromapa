import { describe, it, expect } from 'vitest';
import {
  CATCH_POINTS,
  EXTRA_TIME_MS,
  GAME_HEIGHT,
  MAGNET_RADIUS,
  MAX_DRIFT,
  OBSTACLE_PENALTY,
  TICK_MS,
  catchPoints,
  clampBasket,
  comboMultiplier,
  createInitialState,
  stepGame,
  CosechasState,
  GameItem,
} from '../cosechasEngine';

// Canasta en el centro (basketX 50% = 200px). Un ítem en y=440 queda dentro de la zona de captura.
function playing(overrides: Partial<CosechasState> = {}): CosechasState {
  return { ...createInitialState(), gameActive: true, ...overrides };
}

function item(overrides: Partial<GameItem>): GameItem {
  return { id: 1, emoji: '🌽', x: 200, y: 440, vx: 0, vy: 0, type: 'crop', ...overrides };
}

describe('Cosechas - puntos', () => {
  it('suma +10 por cultivo sin combo', () => {
    const s = stepGame(playing({ items: [item({})], nextId: 10 }), 0);
    expect(s.score).toBe(CATCH_POINTS);
    expect(s.cropsCollected).toBe(1);
    expect(s.combo).toBe(1);
    expect(s.floatingScores[0].text).toBe('+10');
    expect(s.feedback?.text).toBe('¡Buena cosecha!');
    expect(s.flash?.tone).toBe('catch');
  });

  it('el multiplicador de combo se limita a x3', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(3)).toBe(2);
    expect(comboMultiplier(6)).toBe(3);
    expect(comboMultiplier(50)).toBe(3);
  });

  it('la cosecha máxima (combo x3 + doble) es 60, no más', () => {
    expect(catchPoints(99, true)).toBe(60);
    expect(catchPoints(0, false)).toBe(10);
  });

  it('la ronda final no multiplica los puntos', () => {
    const s = stepGame(playing({ timeLeft: 3000, items: [item({})] }), 0);
    expect(s.score).toBe(CATCH_POINTS);
  });

  it('doble cosecha duplica solo los puntos positivos', () => {
    const withDouble = playing({ effects: { double: 6000 }, items: [item({})] });
    expect(stepGame(withDouble, 0).score).toBe(20);

    const hit = playing({ score: 30, effects: { double: 6000 }, items: [item({ emoji: '🪨', type: 'obstacle' })] });
    expect(stepGame(hit, 0).score).toBe(30 - OBSTACLE_PENALTY);
  });
});

describe('Cosechas - obstáculos y escudo', () => {
  it('un obstáculo resta 5, reinicia el combo y muestra feedback de error', () => {
    const s = stepGame(playing({ score: 20, combo: 4, items: [item({ type: 'obstacle', emoji: '🪨' })] }), 0);
    expect(s.score).toBe(15);
    expect(s.combo).toBe(0);
    expect(s.obstaclesHit).toBe(1);
    expect(s.floatingScores[0].text).toBe('-5');
    expect(s.feedback?.text).toBe('¡Cuidado!');
    expect(s.shakeUntil).toBeGreaterThan(s.elapsed);
  });

  it('el puntaje nunca baja de cero', () => {
    const s = stepGame(playing({ score: 2, items: [item({ type: 'obstacle', emoji: '🐛' })] }), 0);
    expect(s.score).toBe(0);
  });

  it('el escudo bloquea solo el próximo obstáculo y luego se consume', () => {
    let s = playing({ effects: { shield: 10000 }, items: [item({ id: 1, type: 'obstacle', emoji: '🪨' })], nextId: 5 });
    s = stepGame(s, 0);
    expect(s.score).toBe(0);
    expect(s.obstaclesHit).toBe(0);
    expect(s.shieldsUsed).toBe(1);
    expect(s.feedback?.text).toBe('🛡️ Escudo utilizado');
    expect(s.effects.shield).toBeUndefined();

    s = { ...s, score: 50, items: [item({ id: 9, type: 'obstacle', emoji: '💨' })] };
    s = stepGame(s, 0);
    expect(s.score).toBe(45);
    expect(s.obstaclesHit).toBe(1);
  });

  it('el escudo expira si no se usa', () => {
    const s = stepGame(playing({ elapsed: 9990, effects: { shield: 10000 } }), 0);
    expect(s.effects.shield).toBeUndefined();
  });
});

describe('Cosechas - tiempo extra', () => {
  it('suma exactamente +5 segundos', () => {
    const s = stepGame(playing({ timeLeft: 10000, items: [item({ type: 'powerup', powerUpType: 'time', emoji: '⏱️' })] }), 0);
    expect(s.timeLeft).toBe(10000 - TICK_MS + EXTRA_TIME_MS);
    expect(s.effects.time).toBeUndefined();
  });
});

describe('Cosechas - imán', () => {
  it('atrae cultivos cercanos gradualmente, sin teletransportarlos', () => {
    const start = 200 - 100; // 100px a la izquierda de la canasta, dentro del radio
    const s0 = playing({ elapsed: 0, effects: { magnet: 8000 }, items: [item({ id: 1, x: start, y: 100, vx: 0, vy: 1 })] });
    const s1 = stepGame(s0, 0);
    const moved = s1.items[0];
    expect(moved.vx).toBeGreaterThan(0); // se curva hacia la canasta
    expect(Math.abs(moved.x - start)).toBeLessThanOrEqual(MAX_DRIFT); // no salta
  });

  it('no afecta cultivos fuera del radio', () => {
    const far = 200 - (MAGNET_RADIUS + 50);
    const s = stepGame(playing({ effects: { magnet: 8000 }, items: [item({ x: far, y: 100, vx: 0, vy: 1 })] }), 0);
    expect(s.items[0].vx).toBe(0);
  });

  it('no afecta obstáculos', () => {
    const s = stepGame(playing({ effects: { magnet: 8000 }, items: [item({ type: 'obstacle', x: 150, y: 100, vx: 0, vy: 1 })] }), 0);
    expect(s.items[0].vx).toBe(0);
  });
});

describe('Cosechas - súper canasta', () => {
  it('amplía la zona de captura: un ítem a 60px se atrapa solo con la canasta grande', () => {
    const caughtNormal = stepGame(playing({ items: [item({ x: 260 })] }), 0);
    expect(caughtNormal.cropsCollected).toBe(0);

    const caughtSuper = stepGame(playing({ effects: { basket: 7000 }, items: [item({ x: 260 })] }), 0);
    expect(caughtSuper.cropsCollected).toBe(1);
  });
});

describe('Cosechas - canasta y estado', () => {
  it('clampea la canasta entre 5% y 95%', () => {
    expect(clampBasket(-10)).toBe(5);
    expect(clampBasket(120)).toBe(95);
  });

  it('termina la partida al llegar a cero y limpia los ítems', () => {
    const s = stepGame(playing({ timeLeft: TICK_MS, items: [item({ y: 0 })] }), 0);
    expect(s.gameActive).toBe(false);
    expect(s.timeLeft).toBe(0);
    expect(s.items).toEqual([]);
  });

  it('no avanza si el juego no está activo', () => {
    const s = createInitialState();
    expect(stepGame(s, 1)).toBe(s);
  });

  it('elimina ítems que cayeron fuera del área', () => {
    const s = stepGame(playing({ items: [item({ x: 10, y: GAME_HEIGHT + 1 })] }), 0);
    expect(s.items).toHaveLength(0);
  });
});
