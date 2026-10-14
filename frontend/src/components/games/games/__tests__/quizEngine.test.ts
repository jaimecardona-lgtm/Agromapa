import { describe, it, expect } from 'vitest';
import {
  FEEDBACK_MS,
  MAX_LIVES,
  advanceQuiz,
  answerQuestion,
  createQuizState,
  getQuizRating,
  precision,
  scoreCorrectAnswer,
  tickQuestionTimer,
} from '../quizEngine';

describe('Quiz - vidas', () => {
  it('empieza con 3 vidas', () => {
    expect(createQuizState(20).lives).toBe(MAX_LIVES);
    expect(MAX_LIVES).toBe(3);
  });

  it('una respuesta incorrecta cuesta 1 vida y muestra feedback', () => {
    const s = answerQuestion(createQuizState(20), 'a', 'b', 20);
    expect(s.phase).toBe('feedback');
    expect(s.lastCorrect).toBe(false);
    expect(s.lives).toBe(2);
    expect(s.score).toBe(0);
  });

  it('una respuesta correcta mantiene vidas y suma puntos y racha', () => {
    const s = answerQuestion(createQuizState(20), 'b', 'b', 20);
    expect(s.lives).toBe(MAX_LIVES);
    expect(s.score).toBeGreaterThan(0);
    expect(s.streak).toBe(1);
    expect(s.lastCorrect).toBe(true);
  });

  it('un error reinicia la racha', () => {
    let s = answerQuestion(createQuizState(20), 'b', 'b', 20);
    s = advanceQuiz(s, 5, 20);
    s = answerQuestion(s, 'a', 'b', 20);
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(1);
  });

  it('agotar el tiempo cuenta como error y cuesta una vida', () => {
    let s = createQuizState(2);
    s = tickQuestionTimer(s, 'b', 2);
    expect(s.phase).toBe('question');
    s = tickQuestionTimer(s, 'b', 2);
    expect(s.phase).toBe('feedback');
    expect(s.selectedId).toBeNull();
    expect(s.lives).toBe(MAX_LIVES - 1);
    expect(s.wrong).toBe(1);
  });

  it('con 0 vidas la partida termina tras el feedback', () => {
    let s = createQuizState(20);
    for (let i = 0; i < MAX_LIVES; i++) {
      s = answerQuestion(s, 'a', 'b', 20);
      s = advanceQuiz(s, 10, 20);
    }
    expect(s.lives).toBe(0);
    expect(s.phase).toBe('ended');
  });

  it('avanza a la siguiente pregunta y reinicia el temporizador', () => {
    let s = answerQuestion(createQuizState(20), 'b', 'b', 20);
    s = advanceQuiz(s, 5, 20);
    expect(s.index).toBe(1);
    expect(s.phase).toBe('question');
    expect(s.timeLeft).toBe(20);
  });

  it('termina al responder la última pregunta', () => {
    let s = answerQuestion(createQuizState(20), 'b', 'b', 20);
    s = advanceQuiz(s, 1, 20);
    expect(s.phase).toBe('ended');
  });

  it('el feedback dura entre 1.5 y 2 segundos', () => {
    expect(FEEDBACK_MS).toBeGreaterThanOrEqual(1500);
    expect(FEEDBACK_MS).toBeLessThanOrEqual(2000);
  });

  it('no avanza desde la fase de pregunta', () => {
    const s = createQuizState(20);
    expect(advanceQuiz(s, 5, 20)).toBe(s);
  });
});

describe('Quiz - puntaje', () => {
  it('bonus de velocidad y racha', () => {
    expect(scoreCorrectAnswer(20, 20, 0)).toBe(150);
    expect(scoreCorrectAnswer(0, 20, 0)).toBe(100);
    expect(scoreCorrectAnswer(0, 20, 2)).toBe(125);
  });
});

describe('Quiz - resultados', () => {
  it('precisión sin respuestas es 0 (sin NaN)', () => {
    expect(precision({ correct: 0, wrong: 0 })).toBe(0);
    expect(precision({ correct: 3, wrong: 1 })).toBe(75);
  });

  it('clasificación según precisión', () => {
    expect(getQuizRating({ correct: 10, wrong: 0 }).label).toBe('Maestro Raíces');
    expect(getQuizRating({ correct: 8, wrong: 2 }).label).toBe('Especialista');
    expect(getQuizRating({ correct: 6, wrong: 4 }).label).toBe('Conocedor');
    expect(getQuizRating({ correct: 4, wrong: 6 }).label).toBe('Aprendiz');
    expect(getQuizRating({ correct: 1, wrong: 9 }).label).toBe('Explorador');
  });
});
