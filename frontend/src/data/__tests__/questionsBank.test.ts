import { describe, it, expect } from 'vitest';
import {
  QUESTIONS_BANK,
  getQuestionsByDifficulty,
  getRandomQuestions,
  type Category,
  type Difficulty,
} from '../questionsBank';

const DIFFICULTIES: Difficulty[] = ['basico', 'intermedio', 'avanzado', 'experto'];
const CATEGORIES: Category[] = [
  'agronomia',
  'biodiversidad',
  'suelos',
  'quimica',
  'biologia',
  'bioeconomia',
  'cultivos',
  'residuos',
  'agua',
  'nutricion',
];

describe('QUESTIONS_BANK structure', () => {
  it('has at least 7 questions for every difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      expect(getQuestionsByDifficulty(difficulty).length, difficulty).toBeGreaterThanOrEqual(7);
    }
  });

  it('has at least one question for every category', () => {
    for (const category of CATEGORIES) {
      const count = QUESTIONS_BANK.filter(q => q.category === category).length;
      expect(count, category).toBeGreaterThanOrEqual(1);
    }
  });

  it('has unique question ids', () => {
    const ids = QUESTIONS_BANK.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly 4 options with ids a, b, c, d and unique texts per question', () => {
    for (const q of QUESTIONS_BANK) {
      expect(q.options.map(o => o.id), q.id).toEqual(['a', 'b', 'c', 'd']);
      const texts = q.options.map(o => o.text);
      expect(new Set(texts).size, q.id).toBe(texts.length);
    }
  });

  it('has a correctAnswerId that matches one of the option ids', () => {
    for (const q of QUESTIONS_BANK) {
      const optionIds = q.options.map(o => o.id);
      expect(optionIds, q.id).toContain(q.correctAnswerId);
    }
  });

  it('has non-empty question and explanation text', () => {
    for (const q of QUESTIONS_BANK) {
      expect(typeof q.question, q.id).toBe('string');
      expect(q.question.trim().length, q.id).toBeGreaterThan(0);
      expect(typeof q.explanation, q.id).toBe('string');
      expect(q.explanation.trim().length, q.id).toBeGreaterThan(0);
    }
  });
});

describe('question selection helpers', () => {
  it('getRandomQuestions(6, "experto") returns 6 distinct experto questions', () => {
    const picked = getRandomQuestions(6, 'experto');
    expect(picked).toHaveLength(6);
    expect(picked.every(q => q.difficulty === 'experto')).toBe(true);
    expect(new Set(picked.map(q => q.id)).size).toBe(6);
  });

  it('getRandomQuestions(5, "basico") returns 5 questions', () => {
    const picked = getRandomQuestions(5, 'basico');
    expect(picked).toHaveLength(5);
    expect(picked.every(q => q.difficulty === 'basico')).toBe(true);
  });
});
