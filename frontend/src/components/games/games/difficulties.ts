import type { Difficulty } from '@/data/questionsBank';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  experto: 'Experto',
};

export const DIFFICULTY_ORDER: Difficulty[] = ['basico', 'intermedio', 'avanzado', 'experto'];

export const DIFFICULTY_ICONS: Record<Difficulty, string> = {
  basico: '🌱',
  intermedio: '🌿',
  avanzado: '🧪',
  experto: '🔥',
};
