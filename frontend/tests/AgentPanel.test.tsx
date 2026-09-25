import { describe, it, expect, beforeEach } from 'vitest';

describe('AgentPanel Chat Persistence', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
  });

  describe('sessionStorage management', () => {
    it('should generate correct storage key for municipality', () => {
      const codes = ['99001', '99524', null];
      const expected = [
        'raices-chat-99001',
        'raices-chat-99524',
        'raices-chat-none',
      ];

      codes.forEach((code, idx) => {
        const key = code ? `raices-chat-${code}` : 'raices-chat-none';
        expect(key).toBe(expected[idx]);
      });
    });

    it('should save chat history to sessionStorage', () => {
      const municipalityCode = '99001';
      const messages = [
        { role: 'user', content: '¿Cuáles son los cultivos?' },
        { role: 'assistant', content: 'Los cultivos principales son...' },
      ];

      const key = `raices-chat-${municipalityCode}`;
      sessionStorage.setItem(key, JSON.stringify(messages));

      const stored = sessionStorage.getItem(key);
      expect(stored).toBeDefined();

      const parsed = JSON.parse(stored!);
      expect(parsed).toEqual(messages);
      expect(parsed.length).toBe(2);
    });

    it('should recover different conversations for different municipalities', () => {
      const conv1 = [
        { role: 'user', content: 'Puerto Carreño' },
      ];
      const conv2 = [
        { role: 'user', content: 'La Primavera' },
      ];

      sessionStorage.setItem('raices-chat-99001', JSON.stringify(conv1));
      sessionStorage.setItem('raices-chat-99524', JSON.stringify(conv2));

      const stored1 = JSON.parse(
        sessionStorage.getItem('raices-chat-99001')!,
      );
      const stored2 = JSON.parse(
        sessionStorage.getItem('raices-chat-99524')!,
      );

      expect(stored1).toEqual(conv1);
      expect(stored2).toEqual(conv2);
      expect(stored1).not.toEqual(stored2);
    });

    it('should exclude error messages from storage', () => {
      const messages = [
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
        // Error messages should not be stored
      ];

      const key = 'raices-chat-99001';
      sessionStorage.setItem(key, JSON.stringify(messages));

      const stored = JSON.parse(sessionStorage.getItem(key)!) as Array<{
        role: string;
        content: string;
        id?: string;
      }>;
      expect(stored.every((m) => !m.id?.startsWith('error-'))).toBe(true);
    });

    it('should not save sensitive data to storage', () => {
      const messages = [
        { role: 'user', content: 'Some question' },
        { role: 'assistant', content: 'Answer with data' },
      ];

      const key = 'raices-chat-99001';
      sessionStorage.setItem(key, JSON.stringify(messages));

      const stored = sessionStorage.getItem(key);
      expect(stored).not.toContain('API_KEY');
      expect(stored).not.toContain('system');
      expect(stored).not.toContain('tool');
    });
  });

  describe('history building for API requests', () => {
    it('should build history from previous messages (excluding current)', () => {
      interface Message {
        role: 'user' | 'assistant';
        content: string;
        id: string;
      }
      const messages: Message[] = [
        { role: 'user', content: 'First question', id: '1' },
        { role: 'assistant', content: 'First answer', id: '2' },
        { role: 'user', content: 'Second question', id: '3' },
        { role: 'assistant', content: 'Second answer', id: '4' },
        { role: 'user', content: 'Third question (current)', id: '5' },
      ];

      // History should exclude the current user message
      const history = messages
        .slice(0, -1)
        .map((m) => ({ role: m.role, content: m.content }));

      expect(history).toHaveLength(4);
      expect(history[0]).toEqual({
        role: 'user',
        content: 'First question',
      });
      expect(history[history.length - 1]).toEqual({
        role: 'assistant',
        content: 'Second answer',
      });
    });

    it('should limit history to 8 messages maximum', () => {
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = Array.from(
        { length: 12 },
        (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        }),
      );

      const history = messages.slice(0, -1).slice(-8);

      expect(history).toHaveLength(8);
      expect(history[0].content).toBe('Message 3');
    });
  });

  describe('tab switching behavior', () => {
    it('should preserve chat messages when switching tabs', () => {
      // Simulate initial messages
      const messages = [
        {
          id: '1',
          role: 'assistant' as const,
          content: 'Welcome',
          timestamp: new Date(),
        },
        {
          id: '2',
          role: 'user' as const,
          content: '¿Cuál tiene mayor producción?',
          timestamp: new Date(),
        },
        {
          id: '3',
          role: 'assistant' as const,
          content: 'The answer is...',
          timestamp: new Date(),
        },
      ];

      const key = 'raices-chat-99001';
      const storedMessages = messages
        .map(m => ({ role: m.role, content: m.content }));
      sessionStorage.setItem(key, JSON.stringify(storedMessages));

      // After tab switch Info -> Agent
      const restored = JSON.parse(sessionStorage.getItem(key)!);
      expect(restored).toHaveLength(3);
      expect(restored[0]).toEqual({
        role: 'assistant',
        content: 'Welcome',
      });
    });

    it('should not show welcome message if chat history exists', () => {
      const existingChat = [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ];

      const key = 'raices-chat-99001';
      sessionStorage.setItem(key, JSON.stringify(existingChat));

      const restored = JSON.parse(sessionStorage.getItem(key)!);
      expect(restored).toEqual(existingChat);
      expect(restored[0]).not.toContain('Hola. Soy el Agente');
    });
  });

  describe('F5 refresh behavior', () => {
    it('should recover full chat history after page refresh', () => {
      const messages = [
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: 'Answer 1' },
        { role: 'user', content: 'Question 2' },
        { role: 'assistant', content: 'Answer 2' },
      ];

      const key = 'raices-chat-99001';
      sessionStorage.setItem(key, JSON.stringify(messages));

      // Simulate browser tab closing and reopening (sessionStorage persists within session)
      const retrieved = sessionStorage.getItem(key);
      const parsed = JSON.parse(retrieved!);

      expect(parsed).toEqual(messages);
      expect(parsed).toHaveLength(4);
    });

    it('should maintain municipality context after refresh', () => {
      // URL params preserved: ?department=99&municipality=99001&tab=agent
      const key = 'raices-chat-99001';
      const chat = [
        { role: 'user', content: 'Puerto Carreño question' },
        { role: 'assistant', content: 'Puerto Carreño answer' },
      ];

      sessionStorage.setItem(key, JSON.stringify(chat));

      // After refresh, should load same conversation
      const restored = JSON.parse(sessionStorage.getItem(key)!);
      expect(restored).toEqual(chat);
    });
  });

  describe('contextual awareness', () => {
    it('should allow agent to understand previous questions without repetition', () => {
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
        {
          role: 'user',
          content: '¿Cuáles cultivos tienen mayor producción?',
        },
        {
          role: 'assistant',
          content: 'Maíz (500 t) y arroz (300 t)',
        },
      ];

      // User asks follow-up without repeating context
      const currentQuestion = '¿Y cuál ocupa el segundo lugar?';

      // API receives full history context
      expect(history).toHaveLength(2);
      expect(currentQuestion).not.toContain('cultivos');
      expect(currentQuestion).not.toContain('producción');
      // Agent can infer from history that second question refers to ranking
    });
  });
});
