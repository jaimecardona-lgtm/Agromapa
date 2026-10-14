export type PowerUpType = 'magnet' | 'shield' | 'time' | 'double' | 'basket';

export interface PowerUp {
  type: PowerUpType;
  icon: string;
  name: string;
  description: string;
  duration: number;
  rarityChance: number;
}

export const POWER_UPS: Record<PowerUpType, PowerUp> = {
  magnet: {
    type: 'magnet',
    icon: '🧲',
    name: 'Imán',
    description: 'Atrae cultivos cercanos',
    duration: 8000,
    rarityChance: 0.15,
  },
  shield: {
    type: 'shield',
    icon: '🛡️',
    name: 'Escudo',
    description: 'Bloquea el próximo obstáculo',
    duration: 10000,
    rarityChance: 0.12,
  },
  time: {
    type: 'time',
    icon: '⏱️',
    name: 'Tiempo Extra',
    description: '+5 segundos',
    duration: 0,
    rarityChance: 0.1,
  },
  double: {
    type: 'double',
    icon: '✨',
    name: 'Doble Cosecha',
    description: 'x2 puntos temporalmente',
    duration: 6000,
    rarityChance: 0.18,
  },
  basket: {
    type: 'basket',
    icon: '🧺',
    name: 'Súper Canasta',
    description: 'Aumenta área de recolección',
    duration: 7000,
    rarityChance: 0.15,
  },
};

export function getRandomPowerUp(rand: () => number = Math.random): PowerUpType | null {
  const roll = rand();
  let accumulated = 0;

  for (const [type, powerUp] of Object.entries(POWER_UPS)) {
    accumulated += powerUp.rarityChance;
    if (roll < accumulated) {
      return type as PowerUpType;
    }
  }

  return null;
}
