// Reglas puras del quiz (Eco-Puzzle y Cazadores de Residuos).
// Sistema de vidas: 3 vidas; una respuesta incorrecta o un tiempo agotado cuesta 1 vida.

export const MAX_LIVES = 3;
export const FEEDBACK_MS = 1800;
export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 50;
export const STREAK_BONUS = 25;
export const STREAK_BONUS_FROM = 3;

export type QuizPhase = 'question' | 'feedback' | 'ended';

export interface QuizState {
  index: number;
  phase: QuizPhase;
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  wrong: number;
  lives: number;
  timeLeft: number;
  elapsedSeconds: number;
  selectedId: string | null; // null = tiempo agotado
  lastCorrect: boolean | null;
  lastPoints: number;
}

export function createQuizState(timePerQuestion: number): QuizState {
  return {
    index: 0,
    phase: 'question',
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    wrong: 0,
    lives: MAX_LIVES,
    timeLeft: timePerQuestion,
    elapsedSeconds: 0,
    selectedId: null,
    lastCorrect: null,
    lastPoints: 0,
  };
}

/** Puntos por acierto: base + bonus de velocidad + bonus de racha. */
export function scoreCorrectAnswer(timeLeft: number, timePerQuestion: number, streakBefore: number): number {
  const speedBonus = Math.floor((Math.max(0, timeLeft) / timePerQuestion) * MAX_SPEED_BONUS);
  const streakBonus = streakBefore + 1 >= STREAK_BONUS_FROM ? STREAK_BONUS : 0;
  return BASE_POINTS + speedBonus + streakBonus;
}

/** Registra la respuesta (o el tiempo agotado si optionId es null). */
export function answerQuestion(
  state: QuizState,
  optionId: string | null,
  correctAnswerId: string,
  timePerQuestion: number,
): QuizState {
  if (state.phase !== 'question') return state;

  const isCorrect = optionId !== null && optionId === correctAnswerId;

  if (isCorrect) {
    const points = scoreCorrectAnswer(state.timeLeft, timePerQuestion, state.streak);
    const streak = state.streak + 1;
    return {
      ...state,
      phase: 'feedback',
      selectedId: optionId,
      lastCorrect: true,
      lastPoints: points,
      score: state.score + points,
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      correct: state.correct + 1,
    };
  }

  return {
    ...state,
    phase: 'feedback',
    selectedId: optionId,
    lastCorrect: false,
    lastPoints: 0,
    streak: 0,
    wrong: state.wrong + 1,
    lives: Math.max(0, state.lives - 1),
  };
}

/** Un segundo de la pregunta actual; al llegar a 0 cuenta como error. */
export function tickQuestionTimer(state: QuizState, correctAnswerId: string, timePerQuestion: number): QuizState {
  if (state.phase !== 'question') return state;
  const timeLeft = state.timeLeft - 1;
  const elapsedSeconds = state.elapsedSeconds + 1;
  if (timeLeft > 0) return { ...state, timeLeft, elapsedSeconds };
  return answerQuestion({ ...state, timeLeft: 0, elapsedSeconds }, null, correctAnswerId, timePerQuestion);
}

/** Pasa a la siguiente pregunta, o termina si no quedan vidas o preguntas. */
export function advanceQuiz(state: QuizState, totalQuestions: number, timePerQuestion: number): QuizState {
  if (state.phase !== 'feedback') return state;
  if (state.lives <= 0 || state.index + 1 >= totalQuestions) {
    return { ...state, phase: 'ended' };
  }
  return {
    ...state,
    index: state.index + 1,
    phase: 'question',
    timeLeft: timePerQuestion,
    selectedId: null,
    lastCorrect: null,
    lastPoints: 0,
  };
}

export function precision(state: Pick<QuizState, 'correct' | 'wrong'>): number {
  const answered = state.correct + state.wrong;
  return answered === 0 ? 0 : Math.round((state.correct / answered) * 100);
}

export function getQuizRating(state: Pick<QuizState, 'correct' | 'wrong'>): { icon: string; label: string } {
  const p = precision(state);
  if (p >= 90) return { icon: '🏆', label: 'Maestro Raíces' };
  if (p >= 75) return { icon: '🧪', label: 'Especialista' };
  if (p >= 60) return { icon: '🌾', label: 'Conocedor' };
  if (p >= 40) return { icon: '🌿', label: 'Aprendiz' };
  return { icon: '🌱', label: 'Explorador' };
}
