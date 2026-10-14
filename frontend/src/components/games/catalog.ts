import type { ComponentType } from 'react';
import type { GameSlug } from '@/services/gameScores';
import type { GameKey } from '@/utils/bestScores';
import { CosechasGame } from './games/CosechasGame';
import { EcoPuzzleGame } from './games/EcoPuzzleGame';
import { ResidueHuntersGame } from './games/ResidueHuntersGame';

export interface GameDefinition {
  slug: GameSlug;
  path: string;
  title: string;
  icon: string;
  description: string;
  bestScoreKey: GameKey;
  Component: ComponentType<{ onQuit: () => void }>;
}

// Un solo componente por juego: la app principal y la ruta pública lo reutilizan.
export const GAMES: GameDefinition[] = [
  {
    slug: 'cosechas',
    path: '/juegos/cosechas',
    title: 'Cosechas',
    icon: '🌾',
    description: 'Recolecta cultivos con tu canasta y evita las plagas y el viento.',
    bestScoreKey: 'cosechas',
    Component: CosechasGame,
  },
  {
    slug: 'eco-puzzle',
    path: '/juegos/eco-puzzle',
    title: 'Eco-Puzzle de Conexiones',
    icon: '🧩',
    description: 'Responde sobre biodiversidad, suelos y bioeconomía en 4 niveles.',
    bestScoreKey: 'ecoPuzzle',
    Component: EcoPuzzleGame,
  },
  {
    slug: 'cazadores-residuos',
    path: '/juegos/cazadores-residuos',
    title: 'Cazadores de Residuos',
    icon: '♻️',
    description: 'Aprende a manejar los residuos agrícolas de forma responsable.',
    bestScoreKey: 'residuos',
    Component: ResidueHuntersGame,
  },
];

export function findGame(slug: GameSlug): GameDefinition | undefined {
  return GAMES.find((game) => game.slug === slug);
}
